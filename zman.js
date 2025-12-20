require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// הקישור הישיר לקובץ ה-CSV שלך
const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/_%D7%96%D7%9E%D7%A0%D7%99%20%D7%94%D7%AA%D7%A4%D7%99%D7%9C%D7%95%D7%AA%20-%20%D7%92%D7%99%D7%9C%D7%99%D7%99%D7%95%D7%9F1.csv'; 

app.get('/minyan', async (req, res) => {
  try {
    // קבלת נתונים מימות המשיח
    let currentIndex = req.query.index !== undefined ? parseInt(req.query.index) : null;
    const digit = req.query.digit;

    console.log(`Request: index=${currentIndex}, digit=${digit}`);

    // משיכת הנתונים מה-CSV
    const response = await axios.get(CSV_URL);
    const csvData = response.data;
    const rows = csvData.split(/\r?\n/); // פיצול שורות תקין
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
      const totalMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

      minyanim.push({
        type: clean(columns[0]),
        shul: clean(columns[1]),
        location: clean(columns[2]),
        time: timeStr,
        minutes: totalMinutes
      });
    }

    minyanim.sort((a, b) => a.minutes - b.minutes);

    if (minyanim.length === 0) {
      return res.send("id_list_message=t-לא נמצאו מניינים בקובץ");
    }

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    // לוגיקה של התפריט
    if (currentIndex === null) {
      // כניסה ראשונה - מציאת המניין הקרוב
      currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
      if (currentIndex === -1) currentIndex = 0;
    } else {
      // אם המשתמש הקיש ספרה
      if (digit === '1') { // הבא
        if (currentIndex < minyanim.length - 1) currentIndex++;
      } else if (digit === '2') { // קודם
        if (currentIndex > 0) currentIndex--;
      } else if (digit === '3') { // כל המניינים
        let allText = "כל המניינים הם: ";
        minyanim.forEach(m => { allText += `${m.type} ב${m.shul} בשעה ${m.time}. `; });
        return res.send(`id_list_message=t-${allText}&go_to_folder=./`);
      } else if (digit === '4') { // יציאה
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
      }
    }

    const m = minyanim[currentIndex];
    const detail = `תפילת ${m.type || ''} ב${m.shul || ''} ${m.location !== '-' ? m.location : ''} בשעה ${m.time}. `;
    const menu = "לשמיעה חוזרת הקש 0, למניין הבא 1, לקודם 2, לכל המניינים 3, ליציאה 4.";

    // הפורמט החדש: read
    // t-TEXT = השמעת טקסט
    // digit = שם המשתנה שיחזור לשרת
    // no = לא להשמיע צפצוף בסיום
    // 1,1,7 = מקסימום ספרה 1, מינימום 1, זמן המתנה 7 שניות
    const responseString = `read=t-${detail}${menu}=digit,no,1,1,7,Digits&api_set_var=index=${currentIndex}`;
    
    console.log("Sending response:", responseString);
    
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(responseString);

  } catch (error) {
    console.error("Error:", error.message);
    res.send('id_list_message=t-חלה שגיאה במערכת');
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
