const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // 1. REQ-0011 RequestData
  const r11 = await p.request.findUnique({
    where: { requestNumber: 'REQ-0011' },
    include: { requestData: true }
  });
  console.log('=== REQ-0011 ===');
  console.log('status:', r11.status);
  console.log('requestData:', JSON.stringify(r11.requestData));

  // 2. All RequestData records
  const all = await p.requestData.findMany();
  console.log('\n=== ALL RequestData (' + all.length + ' records) ===');
  all.forEach(r => {
    console.log('  reqId=' + r.requestId + ' gid=' + r.groupId + ' sgid=' + r.subgroupId + ' cid=' + r.categoryId + ' bid=' + r.brandId + ' mc=' + r.masterCode);
  });

  // 3. REQ-0025 (new E2E test)
  const r25 = await p.request.findUnique({
    where: { requestNumber: 'REQ-0025' },
    include: { requestData: true }
  });
  console.log('\n=== REQ-0025 ===');
  console.log('status:', r25.status);
  console.log('requestData:', JSON.stringify(r25.requestData));

  await p.$disconnect();
})();
