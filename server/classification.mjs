// Explicit desktop apps have no browser URL; legacy web/script inference stays compatible.
export function classifyApp(app){
 const gateway={...(app.gateway||{})},type=app.type==='desktop'?'desktop':gateway.openUrl?'service':'automation';
 if(type==='service'&&gateway.uiStart?.executable){gateway.start=gateway.uiStart;gateway.stop=gateway.uiStop||{executable:'',args:[]};}
 delete gateway.uiStart;delete gateway.uiStop;
 if(type!=='service'){gateway.openUrl='';gateway.healthUrl='';}
 return {...app,type,allowMultipleInstances:app.allowMultipleInstances??false,gateway};
}
