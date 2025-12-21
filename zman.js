require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Server is working! Go to /minyan');
});

app.get('/minyan', (req, res) => {
    console.log("--- CALL RECEIVED ---");
    console.log(req.query);

    // תשובה פשוטה וקבועה לבדיקה
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send('read=t-השרת עובד מצוין. זוהי בדיקת תקשורת=test,no,1,1,7,no,no,no');
});

app.listen(port, () => console.log(`Server started on port ${port}`));
