const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // Count all RequestData records
  const allRD = await p.requestData.findMany();
  console.log('Total RequestData records:', allRD.length);
  allRD.forEach(rd => {
    console.log(`  requestId=${rd.requestId} groupId=${rd.groupId} subgroupId=${rd.subgroupId} masterCode=${rd.masterCode}`);
  });

  // Check REQ-0011 specifically
  const rd11 = await p.requestData.findUnique({
    where: { requestId: 'd6c60f20-0749-45ad-ae84-5fbaaaeb9ab8' }
  });
  console.log('\nREQ-0011 RequestData:', JSON.stringify(rd11, null, 2));

  // Check REQ-0001
  const rd01 = await p.requestData.findUnique({
    where: { requestId: '4fddec43-f0df-41a1-943a-3bc03a47bd10' }
  });
  console.log('\nREQ-0001 RequestData:', JSON.stringify(rd01, null, 2));

  await p.$disconnect();
})();
