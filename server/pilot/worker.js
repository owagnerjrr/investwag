// One useful bounded job, never a daemon/keep-alive. For an owner-controlled local/VM timer.
import {PrismaClient} from '@prisma/client';
import {tick} from './service.js';
if(process.env.PILOT_ENABLED!=='1')throw Error('PILOT_ENABLED must be explicitly enabled');
const db=new PrismaClient();
try{console.log(JSON.stringify(await tick(db)));}finally{await db.$disconnect();}
