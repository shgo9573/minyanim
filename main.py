from fastapi import FastAPI, Query
from fastapi.responses import HTMLResponse
import uvicorn

app = FastAPI()

# משתנים לשמירת הנתונים בזיכרון (מהיר במיוחד)
votes_count = {"1": 0, "2": 0, "3": 0, "4": 0}
voted_phones = set()  # לשמירת המשתמשים שכבר הצביעו

@app.get("/vote")
async def handle_vote(
    option: str = Query(...), 
    ApiPhone: str = Query(None)
):
    """
    נתיב לקבלת הקריאות מימות המשיח.
    דוגמה לקריאה: /vote?option=1&ApiPhone=0501234567
    """
    if option not in votes_count:
        return HTMLResponse("id_list_message=t-שלוחה לא תקינה&go_to_folder=hangup")

    # מניעת הצבעה כפולה לפי מספר טלפון
    if ApiPhone:
        if ApiPhone in voted_phones:
            # הודעה לימות המשיח שהמשתמש כבר הצביע
            return HTMLResponse("id_list_message=t-כבר הצבעת בעבר. תודה!&go_to_folder=hangup")
        
        # שמירת הטלפון ברשימת המצביעים
        voted_phones.add(ApiPhone)

    # הוספת קול
    votes_count[option] += 1

    # מחזיר תשובה מהירה לימות המשיח ומנתק את השיחה
    return HTMLResponse("id_list_message=t-הצבעתך נקלטה בהצלחה. תודה!&go_to_folder=hangup")


@app.get("/api/data")
async def get_data():
    """API שמחזיר את הנתונים העדכניים לדף ה-HTML"""
    total_calls = sum(votes_count.values())
    return {
        "total_calls": total_calls,
        "votes": votes_count,
        "unique_voters": len(voted_phones)
    }


@app.get("/reset")
async def reset_data():
    """נתיב לאיפוס ההצבעות והטלפונים"""
    global votes_count, voted_phones
    votes_count = {"1": 0, "2": 0, "3": 0, "4": 0}
    voted_phones.clear()
    return {"status": "success", "message": "ההצבעות אופסו בהצלחה!"}


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """דף ה-HTML המוצג בדפדפן - מתעדכן בזמן אמת"""
    html_content = """
    <!DOCTYPE html>
    <html lang="he" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>לוח תוצאות בזמן אמת</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; background-color: #f4f4f9; padding: 20px; }
            .card { background: white; border-radius: 10px; padding: 20px; margin: 10px auto; width: 300px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            h1 { color: #333; }
            .number { font-size: 2em; font-weight: bold; color: #007bff; }
            .grid { display: flex; justify-content: center; gap: 15px; flex-wrap: wrap; }
            button { background-color: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; margin-top: 20px; }
            button:hover { background-color: #bd2130; }
        </style>
    </head>
    <body>
        <h1>תוצאות הצבעה בזמן אמת</h1>
        
        <div class="card" style="width: 80%; max-width: 400px; background: #e9ecef;">
            <h2>סך כל הקריאות שנענו: <span id="total" class="number">0</span></h2>
            <h3>מצביעים ייחודיים: <span id="unique">0</span></h3>
        </div>

        <div class="grid">
            <div class="card"><h3>שלוחה 1</h3><div class="number" id="v1">0</div></div>
            <div class="card"><h3>שלוחה 2</h3><div class="number" id="v2">0</div></div>
            <div class="card"><h3>שלוחה 3</h3><div class="number" id="v3">0</div></div>
            <div class="card"><h3>שלוחה 4</h3><div class="number" id="v4">0</div></div>
        </div>

        <button onclick="resetData()">אפס הצבעות</button>

        <script>
            async function updateStats() {
                try {
                    const res = await fetch('/api/data');
                    const data = await res.json();
                    
                    document.getElementById('total').innerText = data.total_calls;
                    document.getElementById('unique').innerText = data.unique_voters;
                    document.getElementById('v1').innerText = data.votes['1'];
                    document.getElementById('v2').innerText = data.votes['2'];
                    document.getElementById('v3').innerText = data.votes['3'];
                    document.getElementById('v4').innerText = data.votes['4'];
                } catch (e) {
                    console.error("שגיאה בעדכון הנתונים", e);
                }
            }

            async function resetData() {
                if (confirm("האם אתה בטוח שברצונך לאפס את כל התוצאות והחסימות?")) {
                    await fetch('/reset');
                    updateStats();
                }
            }

            // עדכון הנתונים אוטומטית כל שנייה אחת בלבד!
            setInterval(updateStats, 1000);
            updateStats();
            </script>
    </body>
    </html>
    """
    return html_content

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
