require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

// פונקציית ניקוי - משאירה רווחים כדי שההקראה תהיה ברורה
function cleanForTTS(str) {
    if (!str) return '';
    // מחליף סימנים ברווחים, ומצמצם רווחים כפולים
    return str.replace(/[.,\-"\'&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  console.log("==================================================");
  console.log(">>> פנייה חדשה נכנסה (History Mode)");
  
  // 1. קבלת ההיסטוריה של ההקשות
  let history = [];
  if (Array.isArray(req.query.menu_choice)) {
      history = req.query.menu_choice;
  } else if (req.query.menu_choice) {
      history = [req.query.menu_choice];
  }

  console.log("היסטוריית הקשות שהתקבלה:", JSON.stringify(history));

  try {
    // 2. משיכת הנתונים
    const response = await axios.get(CSV_URL);
    const csvData = response.data;
    const rows = csvData.split(/\r?\n/);
    let minyanim = [];

    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row) continue;
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (columns.length < 4) continue;
      const clean = (str) => str ? str.replace(/"/g, '').trim() : '';
      const timeStr = clean(columns[3]);
      if (!timeStr || !timeStr.includes(':')) continue;

      const parts = timeStr.split(':');
      minyanim.push({
        type: clean(columns[0]),
        shul: clean(columns[1]), // כאן נשמר שם בית הכנסת
        time: timeStr,
        minutes: parseInt(parts[0]) * 60 + parseInt(parts[1])
      });
    }

    // מיון לפי שעה
    minyanim.sort((a, b) => a.minutes - b.minutes);
    console.log(`סך הכל נמצאו ${minyanim.length} מניינים בקובץ.`);

    // 3. חישוב נקודת ההתחלה (לפי שעה נוכחית)
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
    
    let currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
    // אם עבר הזמן של כל המניינים להיום, נתחיל מהראשון (מחר)
    if (currentIndex === -1) currentIndex = 0; 
    
    console.log(`נקודת התחלה (לפי שעה ${israelTime.getHours()}:${israelTime.getMinutes()}): אינדקס ${currentIndex}`);

    // 4. שחזור התנועה ("Replay") לפי היסטוריית ההקשות
    for (let move of history) {
        if (move === '1') { // הבא
            if (currentIndex < minyanim.length - 1) currentIndex++;
        } else if (move === '2') { // קודם
            if (currentIndex > 0) currentIndex--;
        }
        // מקש '3' ומקש '4' לא משנים את המיקום הנוכחי, רק משנים את ההשמעה
    }

    console.log(`מיקום סופי לאחר חישוב היסטוריה: אינדקס ${currentIndex}`);

    // 5. קביעת הטקסט להשמעה
    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    if (lastMove === '4') {
        console.log("זוהתה בקשת יציאה (4)");
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
    }

    let textToRead = "";
    
    if (lastMove === '3') {
        // === אפשרות 3: השמעת כל הרשימה ===
        console.log("בקשה להשמעת כל הרשימה (3)");
        
        // כאן השינוי שביקשת: הוספנו את m.shul לרשימה
        let all = minyanim.map(m => `תפילת ${m.type} ב${m.shul} בשעה ${m.time}`).join('. ');
        
        textToRead = cleanForTTS("רשימת כל המניינים היא " + all);
    } else {
        // === ברירת מחדל: השמעת המניין הנוכחי ===
        const m = minyanim[currentIndex];
        
        let prefix = "";
        // הודעות מערכת רק אם זו תחילת/סוף רשימה והמשתמש ניסה לזוז לשם
        if (history.length === 0) prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר ";
        if (currentIndex === 0 && lastMove === '2') prefix = "זהו המניין הראשון ";
        if (currentIndex === minyanim.length - 1 && lastMove === '1') prefix = "זהו המניין האחרון ";

        textToRead = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
        console.log(`משמיע מניין בודד: ${m.time} ב${m.shul}`);
    }

    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע");

    // 6. שליחת התשובה
    // שימו לב: אין כאן שום משתנה נוסף (&index=...) כי אנחנו מסתמכים על ההיסטוריה שימות המשיח שולחים לנו ב-menu_choice
    const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
    
    res.send(responseString);

  } catch (error) {
    console.error("Critical Error:", error.message);
    res.send(`id_list_message=t-שגיאה במערכת&go_to_folder=/hangup`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
