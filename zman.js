require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

function cleanForTTS(str) {
    if (!str) return '';
    return str.replace(/[.,\-"\'&%=]/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  // קבלת ההיסטוריה של ההקשות (יכול להגיע כמספר בודד או כמערך)
  let history = [];
  if (Array.isArray(req.query.menu_choice)) {
      history = req.query.menu_choice;
  } else if (req.query.menu_choice) {
      history = [req.query.menu_choice];
  }

  console.log("היסטוריית הקשות:", history);

  try {
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
        shul: clean(columns[1]),
        time: timeStr,
        minutes: parseInt(parts[0]) * 60 + parseInt(parts[1])
      });
    }

    minyanim.sort((a, b) => a.minutes - b.minutes);

    // 1. חישוב נקודת ההתחלה (לפי שעה)
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
    
    let currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
    if (currentIndex === -1) currentIndex = 0; // אם נגמר היום, מתחילים ממחר

    // 2. שחזור התנועה לפי היסטוריית ההקשות
    // אנחנו מריצים מחדש את כל מה שהמשתמש עשה כדי להגיע למיקום הנוכחי
    for (let move of history) {
        if (move === '1') { // הבא
            if (currentIndex < minyanim.length - 1) currentIndex++;
        } else if (move === '2') { // קודם
            if (currentIndex > 0) currentIndex--;
        }
        // מקש '3' (השמעת הכל) לא משנה את המיקום, אז מתעלמים ממנו בחישוב
    }

    // 3. בדיקה מה היה המקש *האחרון* שנלחץ כדי לדעת מה להשמיע
    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    if (lastMove === '4') {
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
    }

    // משתנים להודעה
    let textToRead = "";
    
    if (lastMove === '3') {
        // אם האחרון היה 3 - משמיעים את כל הרשימה
        let all = minyanim.map(m => `${m.type} בשעה ${m.time}`).join(' ');
        textToRead = cleanForTTS("רשימת כל המניינים היא " + all);
    } else {
        // אחרת - משמיעים את המניין הנוכחי שהגענו אליו בחישוב
        const m = minyanim[currentIndex];
        
        let prefix = "";
        if (history.length === 0) prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר "; // הודעה רק בכניסה ראשונה
        if (currentIndex === 0 && history.length > 0) prefix = "זהו המניין הראשון ";
        if (currentIndex === minyanim.length - 1 && history.length > 0) prefix = "זהו המניין האחרון ";

        textToRead = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
    }

    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע");

    // שליחת התשובה הפשוטה ביותר - ללא שום משתנים נלווים!
    // ימות המשיח יזכרו לבד את ה-menu_choice וישלחו לנו אותו שוב בפעם הבאה
    const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
    
    console.log(`Current Index: ${currentIndex}. Sending response.`);
    res.send(responseString);

  } catch (error) {
    console.error("Critical Error:", error.message);
    res.send(`id_list_message=t-שגיאה במערכת&go_to_folder=/hangup`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
