require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
const port = process.env.PORT || 3000;

const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/_%D7%96%D7%9E%D7%A0%D7%99%20%D7%94%D7%AA%D7%A4%D7%99%D7%9C%D7%95%D7%AA%20-%20%D7%92%D7%99%D7%9C%D7%99%D7%99%D7%95%D7%9F1.csv'; 

app.get('/minyan', async (req, res) => {
  try {
    const digit = req.query.digit;
    let currentIndex = req.query.index !== undefined ? parseInt(req.query.index) : null;
    
    // מצב כניסה ראשונית - המשתמש עוד לא הקיש כלום
    if (digit === undefined && currentIndex === null) {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        return res.send(`read=t-ברוכים הבאים למערכת המניינים. לחיפוש המניין הקרוב ביותר הקישו 1.=digit,no,1,1,7,Digits,no,no`);
    }

    // אם אנחנו כאן, סימן שהמשתמש כבר הקיש משהו (או שהוא בתוך התפריט)
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
      if (!timeStr.includes(':')) continue;
      const parts = timeStr.split(':');
      minyanim.push({
        type: clean(columns[0]),
        shul: clean(columns[1]),
        location: clean(columns[2]),
        time: timeStr,
        minutes: parseInt(parts[0]) * 60 + parseInt(parts[1])
      });
    }
    minyanim.sort((a, b) => a.minutes - b.minutes);

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    let prefix = "";

    // לוגיקת הניווט
    if (currentIndex === null && digit === '1') {
      // הקשה ראשונה על 1 - מוצאים את המניין הקרוב ביותר
      currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
      if (currentIndex === -1) currentIndex = 0;
    } else if (currentIndex !== null) {
      // המשתמש כבר בתוך רשימה ודפדף
      if (digit === '1') {
        if (currentIndex < minyanim.length - 1) currentIndex++;
        else prefix = "זהו המניין האחרון. ";
      } else if (digit === '2') {
        if (currentIndex > 0) currentIndex--;
        else prefix = "זהו המניין הראשון. ";
      } else if (digit === '0') {
          // שמיעה חוזרת - לא משנים את האינדקס
      } else if (digit === '3') {
        let allText = "כל המניינים: ";
        minyanim.forEach(m => { allText += `${m.type} ב${m.shul} בשעה ${m.time}. `; });
        return res.send(`id_list_message=t-${allText}&go_to_folder=./`);
      }
    } else {
        // אם הקיש ספרה אחרת בכניסה
        return res.send(`read=t-הקשה שגויה. לחיפוש המניין הקרוב הקישו 1.=digit,no,1,1,7,Digits,no,no`);
    }

    const m = minyanim[currentIndex];
    const detail = `${prefix}תפילת ${m.type || ''} ב${m.shul || ''} בשעה ${m.time}. `;
    const menu = "למניין הבא 1, לקודם 2, לשמיעה חוזרת 0, לכל המניינים 3.";

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(`read=t-${detail}${menu}=digit,no,1,1,7,Digits,no,no,index=${currentIndex}`);

  } catch (error) {
    res.send('id_list_message=t-שגיאה בתקשורת');
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
