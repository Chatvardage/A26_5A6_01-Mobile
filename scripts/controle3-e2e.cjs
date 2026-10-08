/* Vérifie le vrai code HTTP Mobile contre la stack locale. Deux comptes temporaires,
 * supprimés en finally; aucune réinitialisation de volume. Aucun jeton dans le rapport. */
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path');
const crypto = require('node:crypto'); const Module = require('node:module'); const ts = require('typescript');
const base = process.env.CONTROLE3_API_URL || 'http://localhost:3000';
const source = path.resolve(__dirname, '../src'); const cache = new Map();
function load(file) {
  const filename = path.resolve(source, file); if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module); cache.set(filename, mod); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = mod.require.bind(mod);
  mod.require = name => {
    if (name === '@/config/env') return { API_URL: base };
    if (name === '@/i18n') return { getTranslations: () => load('i18n/fr.ts').fr };
    if (name.startsWith('@/')) return load(name.slice(2)+'.ts');
    if (name.startsWith('./')) return load(path.relative(source,path.resolve(path.dirname(filename),name))+'.ts');
    return original(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  return mod.exports;
}
async function main() {
  const http=load('services/httpClient.ts'), auth=load('services/authService.ts'), rooms=load('services/rooms.service.ts'), servers=load('services/serversService.ts'), profiles=load('services/profileService.ts'), messagesService=load('services/messagesService.ts'), receipts=load('services/receipts.service.ts');
  const accounts=[]; let token=null; const results=[];
  http.configureHttpClient({getToken:()=>token});
  async function check(name,run) { await run(); results.push({name,status:'pass'}); console.log('PASS '+name); }
  const request=(route,method='GET',data)=>http.apiFetch(route,{method,...(data?{body:JSON.stringify(data)}:{})});
  try {
    for(let i=0;i<2;i++){ const suffix=crypto.randomBytes(5).toString('hex'); const password=crypto.randomBytes(24).toString('hex'); accounts.push({...await auth.register({pseudo:`c3_${suffix}`,courriel:`c3_${suffix}@example.com`,mot_de_passe:password}), password}); }
    token=accounts[0].jeton;
    await check('Accueil Chatvardage et annonces accessibles',async()=>{const list=await servers.fetchServers();assert.equal(list[0].id,rooms.DEFAULT_SERVER_ID);const details=await rooms.getServer(rooms.DEFAULT_SERVER_ID);assert.equal(details.salons.find(c=>c.id===rooms.ANNOUNCEMENTS_ID).peutEcrire,false);});
    await check('Chatvardage ne peut pas être quitté',async()=>{await assert.rejects(rooms.leaveServer(rooms.DEFAULT_SERVER_ID),e=>e.status===403||e.status===400);});
    let server;
    await check('Création serveur public et salon',async()=>{server=await rooms.createServer('Contrôle 3 temporaire',true);assert.equal(server.monRole,'proprietaire');const room=await rooms.createRoom(server.id,{nom:'lecture',acces:'tous',ecriture:'moderateurs'});assert.ok(room.id);});
    token=accounts[1].jeton;
    await check('Découverte, rejoindre et liste des salons',async()=>{assert.ok((await rooms.discoverServers('Contrôle 3')).some(s=>s.id===server.id));await rooms.joinServer(server.id);const detail=await rooms.getServer(server.id);assert.equal(detail.monRole,'membre');assert.equal(detail.salons.find(c=>c.nom==='lecture').peutEcrire,false);assert.ok((await servers.fetchServerChannels(server.id)).channels.length>=2);});
    await check('Un membre ne peut pas créer un salon',async()=>{await assert.rejects(rooms.createRoom(server.id,{nom:'interdit',acces:'tous',ecriture:'tous'}),e=>e.status===403);});
    await check('Quitter retire l’accès aux salons',async()=>{await rooms.leaveServer(server.id);assert.ok(!(await servers.fetchServers()).some(s=>s.id===server.id));assert.equal((await rooms.getServer(server.id)).salons.length,0);});
    token=accounts[0].jeton;await rooms.updateServer(server.id,{public:false});await rooms.inviteMember(server.id,accounts[1].utilisateur.id);
    token=accounts[1].jeton;
    await check('Invitation privée et acceptation',async()=>{assert.ok((await rooms.getInvitations()).some(i=>i.serveur.id===server.id));await rooms.acceptInvitation(server.id);assert.equal((await rooms.getServer(server.id)).monRole,'membre');});
    await check('Paramètres persistés et présence',async()=>{await profiles.updateProfile({alias:'Contrôle 3',theme:'clair',langue:'fr',modeNotification:'discret'});const profile=await profiles.getProfile();assert.equal(profile.alias,'Contrôle 3');assert.equal(profile.modeNotification,'discret');await profiles.updatePresence('enLigne');assert.equal((await profiles.getProfile()).statutPresence,'enLigne');});
    await check('Message privé réel et historique',async()=>{const partner=accounts[0].utilisateur.id;await request('/api/messages','POST',{recipientId:partner,content:'Preuve contrôle 3'});const messages=await request(`/api/messages/history/${partner}?limit=10`);assert.ok(messages.some(m=>m.content==='Preuve contrôle 3'));});
    token=accounts[0].jeton;
    await check('Pagination membres et changement de rôle',async()=>{assert.ok((await rooms.getMembers(server.id)).membres.some(m=>m.utilisateurId===accounts[1].utilisateur.id));await rooms.changeMemberRole(server.id,accounts[1].utilisateur.id,'moderateur');});
    token=accounts[1].jeton;
    await check('Droits du modérateur mis à jour',async()=>{assert.equal((await rooms.getServer(server.id)).monRole,'moderateur');});
    let first,second;
    await check('Pagination DM directe et messages plus recents',async()=>{
      const conversationId=`dm:${accounts[0].utilisateur.id}`;
      first=await messagesService.sendMessage(conversationId,'Cible ancienne temporaire');
      second=await messagesService.sendMessage(conversationId,'Message suivant temporaire');
      const anchored=await messagesService.fetchHistory(conversationId,1,undefined,{around:first.id});
      assert.deepEqual(anchored.map(m=>m.id),[first.id]);
      const next=await messagesService.fetchHistory(conversationId,1,first.id,{direction:'after'});
      assert.deepEqual(next.map(m=>m.id),[second.id]);
    });
    await check('Une cible DM etrangere est refusee',async()=>{
      await assert.rejects(messagesService.fetchHistory(`dm:${crypto.randomUUID()}`,1,undefined,{around:first.id}),e=>e.status===400);
    });
    await check('L expediteur ne peut pas confirmer la reception',async()=>{
      await assert.rejects(receipts.confirmDelivery(first.id),e=>e.status===403);
    });
    token=accounts[0].jeton;
    await check('Livraison reelle et confirmation idempotente',async()=>{
      const delivered=await receipts.confirmDelivery(first.id);
      assert.ok(delivered.deliveredAt);
      assert.equal(delivered.updatedAt,first.updatedAt);
      const repeated=await receipts.confirmDelivery(first.id);
      assert.equal(repeated.deliveredAt,delivered.deliveredAt);
    });
    const channel=(await rooms.getServer(server.id)).salons[0].id;
    const roomMessage=await messagesService.sendMessage(`room:${channel}`,'Cible salon temporaire');
    await check('Pagination directe de salon et cible etrangere refusee',async()=>{
      const page=await messagesService.fetchHistory(`room:${channel}`,1,undefined,{around:roomMessage.id});
      assert.deepEqual(page.map(m=>m.id),[roomMessage.id]);
      await assert.rejects(messagesService.fetchHistory(`room:${channel}`,1,undefined,{around:first.id}),e=>e.status===400);
    });
    token=accounts[1].jeton;
    await check('Un moderateur ne peut pas exclure le proprietaire',async()=>{
      await assert.rejects(rooms.kickMember(server.id,accounts[0].utilisateur.id),e=>e.status===403);
    });
    token=accounts[0].jeton;
    await check('Exclusion reelle et retrait de la liste des membres',async()=>{
      await rooms.kickMember(server.id,accounts[1].utilisateur.id);
      assert.ok(!(await rooms.getMembers(server.id)).membres.some(m=>m.utilisateurId===accounts[1].utilisateur.id));
    });
    token=accounts[1].jeton;
    await check('Le membre exclu ne peut plus lire les messages du salon',async()=>{
      await assert.rejects(messagesService.fetchHistory(`room:${channel}`,1,undefined,{around:roomMessage.id}),e=>e.status===403||e.status===404);
    });

  } finally {
    for(const account of accounts){ token=account.jeton;await request('/api/auth/me','DELETE',{mot_de_passe_actuel:account.password}).catch(e=>console.error('Nettoyage compte temporaire: HTTP '+e.status)); }
    http.resetHttpClient();
    const folder=path.resolve(__dirname,'../docs/preuves');fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'integration.json'),JSON.stringify({date:new Date().toISOString(),api:base,checks:results},null,2)+'\n');
  }
}
main().catch(error=>{ console.error(error.message);process.exitCode=1; });
