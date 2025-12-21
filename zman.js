require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// הקישור המעודכן ששלחת
const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/zmanim.csv'; 

function cleanForTTS(str) {
    if (!str) return '';
    return str.replace(/[.,\-"\']/g, ' ').replace(/\s+/g, ' ').trim();
}

app.get('/minyan', async (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');

  try {
    // לוג לבדיקת הנתונים שמגיעים מהטלפון
    console.log(`Incoming: menu_choice=${req.query.menu_choice}, minyan_index=${req.query.minyan_index}`);

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
      const totalMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

      minyanim.push({
        type: clean(columns[0]),
        shul: clean(columns[1]),
        time: timeStr,
        minutes: totalMinutes
      });
    }

    minyanim.sort((a, b) => a.minutes - b.minutes);

    // לוגיקת המיקום
    let currentIndex = (req.query.minyan_index !== undefined) ? parseInt(req.query.minyan_index) : null;
    const action = req.query.menu_choice;
    let prefixMessage = "";

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();

    if (currentIndex === null || isNaN(currentIndex)) {
      currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
      if (currentIndex === -1) {
        currentIndex = 0;
        prefixMessage = "לא נמצאו מניינים נוספים להיום מנייני מחר ";
      }
    } else {
      // כאן התיקון - אם המשתמש לחץ, ה-currentIndex כבר קיים והוא ישתנה
      if (action === '1') { // הבא
        if (currentIndex < minyanim.length - 1) currentIndex++;
        else prefixMessage = "זהו המניין האחרון ";
      } else if (action === '2') { // קודם
        if (currentIndex > 0) currentIndex--;
        else prefixMessage = "זהו המניין הראשון ";
      } else if (action === '3') {
        let allText = minyanim.map(m => `תפילת ${m.type} בשעה ${m.time}`).join(' ');
        return res.send(`id_list_message=t-${cleanForTTS("כל המניינים הם " + allText)}&go_to_folder=./`);
      } else if (action === '4') {
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
      }
    }

    const m = minyanim[currentIndex];
    const details = `${prefixMessage} תפילת ${m.type || ''} ב${m.shul || ''} בשעה ${m.time} `;
    const menu = "לשמיעה חוזרת הקש אפס למניין הבא אחת לקודם שתיים לכל המניינים שלוש ליציאה ארבע";
    const finalTTS = cleanForTTS(details + menu);

    // =================================================================
    // הפתרון לניתוק: שליחת פקודות בשורות נפרדות
    // =================================================================
    const responseString = `api_set_var=minyan_index=${currentIndex}\nread=t-${finalTTS}=menu_choice,number,1,1,7,no,no,no`;
    
    console.log("Response sent:", responseString);
    res.send(responseString);

  } catch (error) {
    console.error("Error:", error.message);
    res.send(`id_list_message=t-חלה שגיאה במערכת`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
