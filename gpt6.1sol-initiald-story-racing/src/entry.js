const params=new URLSearchParams(location.search);
if(params.has('models'))import('./model-viewer.js');
else import('./main.js');
