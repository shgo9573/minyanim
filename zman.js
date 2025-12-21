require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// ==================================================================
// שים לב! עדכן כאן את הקישור החדש שלך אחרי ששינית לשם באנגלית (data.csv)
// הורדתי את ה-refs/heads מהקישור כי זה שובר אותו
// ==================================================================
const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/main/data.csv'; 

app.get('/minyan', async (req, res) => {
  // הגדרת כותרות מיד בהתחלה כדי למנוע ניתוקים
  res.set('Content-Type', 'text/plain; charset=utf-8');

  try {
    console.log("Attempting to fetch CSV from:", CSV_URL);
    
    // משיכת הנתונים עם הגדרות מיוחדות לגיטהאב
    const response = await axios.get(CSV_URL, {
        responseType: 'text',
        headers: { 'User-Agent': 'Node.js App' } // גיטהאב לפעמים חוסם בלי זה
    });

    const csvData = response.data;
    
    // בדיקה שהקובץ לא ריק
    if (!csvData || csvData.length < 10) {
        console.error("CSV is empty or too short");
        return res.send("id_list_message=t-הקובץ שהתקבל מגיטהאב ריק או לא תקין");
    }

    const rows = csvData.split(/\r?\n/);
    let minyanim = [];

    // עיבוד הנתונים
    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row) continue;
      // פיצול לפי פסיק
      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      if (columns.length < 4) continue;

      const clean = (str) => str ? str.replace(/"/g, '').trim() : '';
      const timeStr = clean(columns[3]); // עמודה D - שעה
      
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

    // מיון
    minyanim.sort((a, b) => a.minutes - b.minutes);

    if (minyanim.length === 0) {
        return res.send("id_list_message=t-לא נמצאו מניינים תקינים בקובץ, נא לבדוק את המבנה");
    }

    // === לוגיקת התפריט ===
    
    // בדיקת מיקום נוכחי
    let currentIndex;
    if (req.query.minyan_index) {
        currentIndex = parseInt(req.query.minyan_index);
    } else {
        // מציאת מניין קרוב
        const now = new Date();
        const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
        const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
        currentIndex = minyanim.findIndex(m => m.minutes >= curMin);
        if (currentIndex === -1) currentIndex = 0;
    }

    // בדיקת לחיצת מקשים
    const action = req.query.menu_choice;
    
    if (action === '1') { // הבא
        if (currentIndex < minyanim.length - 1) currentIndex++;
    } else if (action === '2') { // קודם
        if (currentIndex > 0) currentIndex--;
    } else if (action === '3') { // הכל
        let allText = minyanim.map(m => `תפילת ${m.type} ב${m.shul} בשעה ${m.time}`).join('. ');
        // שימוש ב-read כדי להחזיר את המשתמש לאותו מקום אחרי השמיעה
        return res.send(`read=t-רשימת כל המניינים: ${allText}. לחזרה לתפריט הקש סולמית=menu_choice,number,1,1,1,Digits&minyan_index=${currentIndex}`);
    } else if (action === '4') { // יציאה
        return res.send(`id_list_message=t-להתראות&hangup=yes`);
    }

    // הכנת הטקסט להשמעה
    const m = minyanim[currentIndex];
    const details = `תפילת ${m.type || ''} ב${m.shul || ''} בשעה ${m.time}. `;
    
    let menuText = "לשמיעה חוזרת הקש 0. ";
    if (currentIndex < minyanim.length - 1) menuText += "למניין הבא 1. ";
    if (currentIndex > 0) menuText += "למניין הקודם 2. ";
    menuText += "לכל המניינים 3. ליציאה 4.";

    // שליחת התשובה
    const responseString = `read=t-${details} ${menuText}=menu_choice,number,1,1,7,Digits&minyan_index=${currentIndex}`;
    
    console.log("Sending response:", responseString);
    res.send(responseString);

  } catch (error) {
    console.error("Critical Error:", error.message);
    
    // זה החלק החשוב - מקריא את השגיאה בטלפון במקום לנתק
    let errorMsg = "חלה שגיאה במערכת. ";
    if (error.response && error.response.status === 404) {
        errorMsg += "הקובץ לא נמצא בגיטהאב. בדוק את הקישור.";
    } else {
        errorMsg += "שגיאה כללית בשרת.";
    }
    
    res.send(`id_list_message=t-${errorMsg}`);
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
