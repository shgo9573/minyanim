require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// *** חשוב מאוד: שים כאן את הקישור ל-RAW של ה-CSV שלך ***
const CSV_URL = 'https://raw.githubusercontent.com/shgo9573/minyanim/refs/heads/main/_%D7%96%D7%9E%D7%A0%D7%99%20%D7%94%D7%AA%D7%A4%D7%99%D7%9C%D7%95%D7%AA%20-%20%D7%92%D7%99%D7%9C%D7%99%D7%95%D7%9F1.csv'; 

app.get('/minyan', async (req, res) => {
  try {
    const response = await axios.get(CSV_URL);
    const csvData = response.data;

    const now = new Date();
    const israelTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jerusalem"}));
    const curMin = israelTime.getHours() * 60 + israelTime.getMinutes();
    
    let bestText = "לא נמצאו מניינים נוספים להיום";
    let minDiff = 1440; 

    const rows = csvData.split('\n'); 

    for (let i = 1; i < rows.length; i++) {
      let row = rows[i].trim();
      if (!row) continue;

      const columns = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/); 
      if (columns.length < 4) continue;

      const clean = (str) => str ? str.replace(/"/g, '').trim() : '';
      const type = clean(columns[0]);    
      const shul = clean(columns[1]);    
      const location = clean(columns[2]); 
      const timeStr = clean(columns[3]);  

      if (!timeStr || !timeStr.includes(':')) continue;

      const parts = timeStr.split(':');
      const rMin = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      const diff = rMin - curMin;

      if (diff >= 0 && diff < minDiff) {
        minDiff = diff;
        let tts = `תפילת ${type || 'התפילה'} `; 
        if (shul && shul !== '-') tts += `ב${shul} `;
        if (location && location !== '-') tts += `ב${location} `;
        tts += `בשעה ${timeStr}`;
        bestText = tts;
      }
    }

    // זו השורה הקריטית - הפורמט שימות המשיח מבינים
    const finalResponse = `id_list_message=t-${bestText}`;
    
    // הדפסה ללוג כדי שתוכל לראות שזה נשלח נכון
    console.log("Sending to Yemot:", finalResponse);

    // הגדרת כותרות כדי שהעברית לא תשתבש
    res.set('Content-Type', 'text/plain; charset=utf-8');
    
    // שליחת התשובה
    res.send(finalResponse);

  } catch (error) {
    console.error('Error:', error.message);
    res.send('id_list_message=t-חלה שגיאה במשיכת הנתונים');
  }
});

app.get('/', (req, res) => {
  res.send('Server is live! Use /minyan');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
