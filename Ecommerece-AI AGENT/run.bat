@echo off
set "ROOT=E:\Ecommerece-AI AGENT"
set "PATH=C:\Users\hp\AppData\Local\Programs\Python\Python313;C:\Users\hp\AppData\Local\Programs\Python\Python313\Scripts;%PATH%"

cd /d "%ROOT%\frontend"
call npm install && call npm run build

cd /d "%ROOT%\backend"
python -m pip install -r requirements.txt
if not exist ecommerce_ai.db python seed.py
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000