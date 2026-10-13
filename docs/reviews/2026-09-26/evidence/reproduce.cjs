// Independent checks; no production services, payments or external database used.
const root=require('path').resolve(__dirname,'../../../../backend');
require(root+'/node_modules/reflect-metadata');
const {PGlite}=require(root+'/node_modules/@electric-sql/pglite');
const {drizzle}=require(root+'/node_modules/drizzle-orm/pglite');
const {ConfigService}=require(root+'/node_modules/@nestjs/config');
const {JwtService}=require(root+'/node_modules/@nestjs/jwt');
const {Reflector}=require(root+'/node_modules/@nestjs/core');
const {BillingService}=require(root+'/dist/billing/billing.service');
const {ContentService}=require(root+'/dist/content/content.service');
const {ContentController}=require(root+'/dist/content/content.controller');
const {RbacGuard}=require(root+'/dist/rbac/rbac.guard');
const {EntitlementService}=require(root+'/dist/entitlement/entitlement.service');
const {buildJwtConfig}=require(root+'/dist/auth/jwt-config');
const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
(async()=>{
 const pg=new PGlite(); await pg.waitReady;
 const dir=root+'/src/db/migrations';
 const journal=JSON.parse(fs.readFileSync(dir+'/meta/_journal.json'));
 for(const e of journal.entries){
  const sql=fs.readFileSync(dir+'/'+e.tag+'.sql','utf8').replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;?/g,'');
  for(const s of sql.split('--> statement-breakpoint')) if(s.trim()) await pg.exec(s);
 }
 console.log('22 migrations applied to PGlite; only CREATE EXTENSION pgcrypto omitted (native UUID generation).');
 const fks=await pg.query(`select conrelid::regclass::text as table_name,count(*)::int as count from pg_constraint where contype='f' group by conrelid order by 1`);
 console.log('SQL foreign keys:',JSON.stringify(fks.rows));
 console.log('SQL FK total:',fks.rows.reduce((a,x)=>a+x.count,0));
 const db=drizzle(pg);
 const uid='11111111-1111-4111-8111-111111111111';
 await pg.query('insert into users(id,email) values ($1,$2)',[uid,'review@example.invalid']);
 const bill=new BillingService(db,{handleWebhook:async()=>({confirmed:true,providerRef:'local-checkout'})},{},new ConfigService({}));
 await pg.query("insert into payment_orders(user_id,provider,provider_ref,plan,amount_cents) values ($1,'chargily','local-checkout','monthly',35000)",[uid]);
 try{
  await bill.handleChargilyWebhook({eventId:'local-event',eventType:'checkout.paid',payload:{amount:35000,currency:'DZD'}});
  throw new Error('Unexpected success');
 }catch(e){
  console.log('Actual BillingService payment credit:',e.code,e.constraint,e.message);
  assert.equal(e.constraint,'entitlements_plan_check');
 }
 const p=(await pg.query("insert into programmes(name_fr,country,study_year) values ('Test','DZ',1) returning id")).rows[0].id;
 const m=(await pg.query("insert into modules(programme_id,name_fr) values ($1,'Test') returning id",[p])).rows[0].id;
 const d=(await pg.query("insert into decks(module_id,name_fr,is_premium) values ($1,'Premium',true) returning id",[m])).rows[0].id;
 const c=(await pg.query("insert into cards(deck_id,type,status,is_premium,content) values ($1,'basic','draft',true,'{\"front_fr\":\"PRIVATE DRAFT\",\"back_fr\":\"ANSWER\"}') returning id",[d])).rows[0].id;
 const content=new ContentService(db);
 const rows=await content.listDeckCards({deckId:d,versionSince:0,limit:20});
 assert.equal(rows.items[0].content.front_fr,'PRIVATE DRAFT');
 console.log('ContentService listDeckCards returns premium draft without user/entitlement:',JSON.stringify(rows.items));
 const guard=new RbacGuard(new Reflector());
 const ctx=(handler,role)=>({getHandler:()=>handler,getClass:()=>ContentController,switchToHttp:()=>({getRequest:()=>({user:{role}})})});
 console.log('RbacGuard student reading deck cards:',guard.canActivate(ctx(ContentController.prototype.deckCards,'student')));
 console.log('RbacGuard author transitioning cards:',guard.canActivate(ctx(ContentController.prototype.transitionCard,'author')));
 for(const to of ['review','approved','published']) await content.transitionCard({userId:uid,cardId:c,to});
 console.log('Same author completed draft -> review -> approved -> published via actual service.');
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{format:'pem',type:'pkcs8'},publicKeyEncoding:{format:'pem',type:'spki'}});
 const opts=buildJwtConfig({keyPath:'ephemeral',ttlSeconds:900,nodeEnv:'production',readKey:()=>keys.privateKey});
 const jwt=new JwtService(opts);
 const ent=new EntitlementService(jwt,{currentEntitlement:async()=>({plan:'premium',isActive:true,graceUntilMs:0})},new ConfigService({}));
 const issued=await ent.issue(uid,'test');
 try{await ent.verify(issued.jwt);throw new Error('Unexpected verification success');}catch(e){console.log('Entitlement.verify RS256 without explicit PUBLIC path:',e.message);assert.equal(e.message,'secret or public key must be provided');}
 const hs=new JwtService({secret:'local-test-key-not-a-production-secret'});
 const token=await hs.signAsync({plan:'premium'},{algorithm:'HS256'});
 try{await ent.verify(token);throw new Error('Unexpected HS success');}catch(e){console.log('Forged HS256 rejected with production module options:',e.message);assert.equal(e.message,'secret or public key must be provided');}
 await pg.close();
 console.log('All expected findings reproduced.');
})().catch(e=>{console.error(e);process.exitCode=1;});
