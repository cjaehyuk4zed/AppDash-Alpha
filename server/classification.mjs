// UI presence defines the two user-facing app categories.
export function classifyApp(app){
 const gateway={...(app.gateway||{})},type=gateway.openUrl?'service':'automation';
 if(type==='service'&&gateway.uiStart?.executable){gateway.start=gateway.uiStart;gateway.stop=gateway.uiStop||{executable:'',args:[]};}
 delete gateway.uiStart;delete gateway.uiStop;
 if(type==='automation'){gateway.openUrl='';gateway.healthUrl='';}
 return {...app,type,gateway};
}
