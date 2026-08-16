const token = 'xai-8PO9HNl4JPM3h2VO3Q4TcOTRuH2crErqFOVN4r3QTIM1eWlqnxAAAj4QMYy2t9lTdB9OQg5qN30bDMGd';
fetch('https://api.x.ai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'grok-beta',
    messages: [{role: 'user', content: 'hello'}]
  })
}).then(r => r.json()).then(console.log).catch(console.error);
