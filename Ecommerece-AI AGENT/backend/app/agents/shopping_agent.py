"""
LangGraph shopping assistant.

Implements the workflow described in the project spec:

    customer message -> intent classification -> tool selection
    -> DB/API call (via tools) -> LLM response generation
    -> conversation memory update -> final response

`classify_intent` and `generate_reply` are explicit graph nodes so the
intent is visible/loggable independently of the tool-calling loop,
which is delegated to a LangGraph ReAct agent (`create_react_agent`)
for the actual tool-selection + tool-execution cycle - that prebuilt
node already implements the "tool selection -> call -> re-prompt"
loop correctly, so we compose with it rather than re-implement it.
"""
from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import create_react_agent
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.tools.cart_tools import make_cart_tools
from app.tools.misc_tools import make_misc_tools
from app.tools.order_tools import make_order_tools
from app.tools.product_tools import make_product_tools

SYSTEM_PROMPT = """You are Aria, the AI shopping assistant for an online store.

You help customers search for products, compare options, get personalized
recommendations, manage their cart and wishlist, track and cancel orders,
apply coupons, and answer policy questions (shipping, returns, warranty).

Guidelines:
- Always use your tools to look up real product, cart, and order data -
  never invent prices, stock levels, order statuses, or policies.
- When a request is ambiguous (e.g. "shoes for hiking" with no budget,
  size, or terrain given), ask 1-3 concise clarifying questions before
  searching, unless the customer has already given enough detail.
- When recommending or comparing products, briefly explain *why* each
  one fits what the customer asked for.
- Keep replies concise and conversational - this is a chat widget, not
  an essay. Use short paragraphs or bullet points for multiple items.
- All prices are in Pakistani Rupees. Always write them as Rs. 2,500 (never with $
  or USD) and use the numbers exactly as the tools return them.
- Never fabricate an order number, coupon code, or ticket ID.
- If you cancel an order or create a support ticket, confirm clearly
  what you did.
"""

INTENT_LABELS = [
    "product_search",
    "product_comparison",
    "recommendation",
    "cart_management",
    "order_tracking",
    "order_cancellation",
    "coupon_or_pricing",
    "policy_or_faq",
    "support_request",
    "general_chat",
]


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    intent: str


def _get_llm() -> ChatAnthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not configured on the server. Set it in backend/.env to enable the AI assistant."
        )
    return ChatAnthropic(model=settings.ANTHROPIC_MODEL, api_key=settings.ANTHROPIC_API_KEY, temperature=0.3)


def build_graph(db: Session, current_user: User):
    """Compile a fresh graph bound to this request's DB session and user.

    Tools close over `db`/`current_user` so every DB write the agent makes
    (add to cart, cancel order, etc.) happens in the caller's request-scoped
    session and is committed/rolled back with it.
    """
    llm = _get_llm()

    tools = (
        make_product_tools(db)
        + make_cart_tools(db, current_user)
        + make_order_tools(db, current_user)
        + make_misc_tools(db, current_user)
    )

    react_agent = create_react_agent(llm, tools, prompt=SYSTEM_PROMPT)

    def classify_intent(state: AgentState) -> dict:
        last_user_msg = next(
            (m.content for m in reversed(state["messages"]) if isinstance(m, HumanMessage)), ""
        )
        classifier = llm.bind(temperature=0)
        prompt = (
            "Classify the customer's message into exactly one of these intents: "
            f"{', '.join(INTENT_LABELS)}.\nRespond with only the label.\n\nMessage: {last_user_msg}"
        )
        try:
            result = classifier.invoke([SystemMessage(content=prompt)])
            label = result.content.strip().lower().replace(" ", "_")
            intent = label if label in INTENT_LABELS else "general_chat"
        except Exception:
            intent = "general_chat"
        return {"intent": intent}

    def run_agent(state: AgentState) -> dict:
        result = react_agent.invoke({"messages": state["messages"]})
        return {"messages": result["messages"]}

    graph = StateGraph(AgentState)
    graph.add_node("classify_intent", classify_intent)
    graph.add_node("agent", run_agent)
    graph.set_entry_point("classify_intent")
    graph.add_edge("classify_intent", "agent")
    graph.add_edge("agent", END)

    return graph.compile()


def run_shopping_agent(db: Session, current_user: User, history: list[dict], user_message: str) -> dict:
    """Run one turn of the assistant. `history` is prior turns as
    [{"role": "user"|"assistant", "content": str}, ...]. Returns the
    intent classification, final reply text, and names of tools used
    (for logging / the admin AI conversation log)."""
    graph = build_graph(db, current_user)

    messages: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
    for turn in history:
        if turn["role"] == "user":
            messages.append(HumanMessage(content=turn["content"]))
        elif turn["role"] == "assistant":
            messages.append(AIMessage(content=turn["content"]))
    messages.append(HumanMessage(content=user_message))

    final_state = graph.invoke({"messages": messages, "intent": ""})

    reply = ""
    tool_calls: list[str] = []
    for m in final_state["messages"]:
        if isinstance(m, AIMessage) and getattr(m, "tool_calls", None):
            tool_calls.extend(tc["name"] for tc in m.tool_calls)
        if isinstance(m, AIMessage) and m.content:
            reply = m.content

    return {"intent": final_state.get("intent", "general_chat"), "reply": reply, "tool_calls": tool_calls}
