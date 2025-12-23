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

  // יצירת חותמת זמן ללוגים
  const timeLog = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });

  console.log(`\n\n========== [${timeLog}] פנייה חדשה נכנסה ==========`);
  
  // 1. קבלת ההיסטוריה
  let history = [];
  // ימות המשיח שולחים מערך אם היו כמה הקשות, או מחרוזת אם הייתה אחת
  if (Array.isArray(req.query.menu_choice)) {
      history = req.query.menu_choice;
  } else if (req.query.menu_choice) {
      history = [req.query.menu_choice];
  }

  // הדפסה ברורה של מה שהתקבל
  console.log(`[LOG] היסטוריית הקשות שהתקבלה מהטלפון: [${history.join(', ')}]`);

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
    console.log(`[LOG] נטענו ${minyanim.length} מניינים מהקובץ.`);

    // חישוב התחלה
    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
    
    let currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
    if (currentIndex === -1) currentIndex = 0; 
    
    console.log(`[LOG] נקודת התחלה (לפי שעה): אינדקס ${currentIndex}`);

    // שחזור תנועה
    for (let move of history) {
        if (move === '1') { 
            if (currentIndex < minyanim.length - 1) currentIndex++;
        } else if (move === '2') { 
            if (currentIndex > 0) currentIndex--;
        }
    }

    console.log(`[LOG] מיקום סופי לאחר חישוב: אינדקס ${currentIndex} (מניין: ${minyanim[currentIndex].time})`);

    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    if (lastMove === '4') {
        console.log(`[LOG] המשתמש ביקש לצאת.`);
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
    }

    let textToRead = "";
    
    if (lastMove === '3') {
        console.log(`[LOG] המשתמש ביקש לשמוע את הכל.`);
        let all = minyanim.map(m => `תפילת ${m.type} ב${m.shul} בשעה ${m.time}`).join('. ');
        textToRead = cleanForTTS("רשימת כל המניינים היא " + all);
    } else {
        const m = minyanim[currentIndex];
        let prefix = "";
        
        if (history.length === 0) prefix = "לא נמצאו מניינים נוספים להיום מנייני מחר ";
        if (currentIndex === 0 && history.length > 0) prefix = "זהו המניין הראשון ";
        if (currentIndex === minyanim.length - 1 && history.length > 0) prefix = "זהו המניין האחרון ";

        textToRead = cleanForTTS(`${prefix} תפילת ${m.type} ב${m.shul} בשעה ${m.time}`);
        console.log(`[LOG] משמיע: ${textToRead}`);
    }

    const menu = cleanForTTS("לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע");
    const responseString = `read=t-${textToRead} ${menu}=menu_choice,number,1,1,7,no,no,no`;
    
    res.send(responseString);
    console.log("========== סיום טיפול בבקשה ==========\n");

  } catch (error) {
    console.error("[ERROR] שגיאה קריטית:", error.message);
    res.send(`id_list_message=t-שגיאה במערכת&go_to_folder=/hangup`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
