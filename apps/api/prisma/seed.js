const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Seeding database...');
    
    // Clean existing data
    await prisma.auditEvent.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.workflowHistory.deleteMany();
    await prisma.workflowTask.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.requestAccountingCode.deleteMany();
    await prisma.requestData.deleteMany();
    await prisma.request.deleteMany();
    await prisma.masterItem.deleteMany();
    await prisma.rolePermission.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.permission.deleteMany();
    await prisma.role.deleteMany();
    await prisma.department.deleteMany();
    await prisma.user.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.unitOfMeasure.deleteMany();
    await prisma.catalogCategory.deleteMany();
    await prisma.catalogSubgroup.deleteMany();
    await prisma.catalogGroup.deleteMany();
    await prisma.company.deleteMany();
    
    console.log('Cleaned existing data');
    
    // Company
    const company = await prisma.company.create({
      data: { id: 'c1', name: 'Empresa A — Distribuidora Central', code: 'EMP-A' }
    });
    console.log('Created company:', company.name);
    
    // Departments
    await prisma.department.create({ data: { id: 'd1', companyId: company.id, name: 'Compras', code: 'COMPRAS' } });
    await prisma.department.create({ data: { id: 'd2', companyId: company.id, name: 'Almacén', code: 'ALMACEN' } });
    await prisma.department.create({ data: { id: 'd3', companyId: company.id, name: 'Contabilidad', code: 'CONTAB' } });
    console.log('Created 3 departments');
    
    // Users
    await prisma.user.create({ data: { id: 'u1', username: 'j.perez', displayName: 'Juan Pérez', email: 'j.perez@empresa.com' } });
    await prisma.user.create({ data: { id: 'u2', username: 'm.garcia', displayName: 'María García', email: 'm.garcia@empresa.com' } });
    await prisma.user.create({ data: { id: 'u3', username: 'c.rodriguez', displayName: 'Carlos Rodríguez', email: 'c.rodriguez@empresa.com' } });
    await prisma.user.create({ data: { id: 'u4', username: 'a.lopez', displayName: 'Ana López', email: 'a.lopez@empresa.com' } });
    await prisma.user.create({ data: { id: 'u5', username: 'l.martinez', displayName: 'Luis Martínez', email: 'l.martinez@empresa.com' } });
    console.log('Created 5 users');
    
    // Roles
    const roles = [
      { id: 'r1', code: 'REQUESTER', name: 'Solicitante' },
      { id: 'r2', code: 'DEPARTMENT_MANAGER', name: 'Gerente' },
      { id: 'r3', code: 'WAREHOUSE', name: 'Almacén' },
      { id: 'r4', code: 'ACCOUNTING', name: 'Contabilidad' },
      { id: 'r5', code: 'FINAL_REVIEWER', name: 'Revisión Final' },
      { id: 'r6', code: 'MASTER_DATA_ADMIN', name: 'Admin MDM' },
    ];
    for (const role of roles) {
      await prisma.role.create({ data: role });
    }
    console.log('Created 6 roles');
    
    // Permissions
    const permissions = [
      'REQUEST.CREATE', 'REQUEST.VIEW', 'WAREHOUSE.CLASSIFY', 'WAREHOUSE.VIEW',
      'ACCOUNTING.APPROVE', 'ACCOUNTING.VIEW', 'IMPORT.RUN', 'IMPORT.VIEW',
      'AUDIT.VIEW', 'ADMIN.MANAGE', 'DASHBOARD.VIEW'
    ];
    for (const code of permissions) {
      await prisma.permission.create({ data: { code } });
    }
    console.log('Created 11 permissions');
    
    // User Roles
    await prisma.userRole.create({ data: { userId: 'u1', roleId: 'r1', companyId: company.id } });
    await prisma.userRole.create({ data: { userId: 'u2', roleId: 'r2', companyId: company.id } });
    await prisma.userRole.create({ data: { userId: 'u3', roleId: 'r3', companyId: company.id } });
    await prisma.userRole.create({ data: { userId: 'u4', roleId: 'r4', companyId: company.id } });
    await prisma.userRole.create({ data: { userId: 'u5', roleId: 'r6', companyId: company.id } });
    console.log('Created 5 user roles');
    
    // Catalog Groups
    await prisma.catalogGroup.create({ data: { id: 'g1', code: 'RVH', name: 'Repuestos de Vehículos' } });
    await prisma.catalogGroup.create({ data: { id: 'g2', code: 'MEC', name: 'Mecánica' } });
    await prisma.catalogGroup.create({ data: { id: 'g3', code: 'ELE', name: 'Eléctrico' } });
    await prisma.catalogGroup.create({ data: { id: 'g4', code: 'HID', name: 'Hidráulico' } });
    await prisma.catalogGroup.create({ data: { id: 'g5', code: 'TRA', name: 'Transmisión' } });
    console.log('Created 5 catalog groups');
    
    // Catalog Subgroups
    await prisma.catalogSubgroup.create({ data: { id: 'sg1', groupId: 'g1', code: 'CAR', name: 'Carrocería' } });
    await prisma.catalogSubgroup.create({ data: { id: 'sg2', groupId: 'g1', code: 'MOT', name: 'Motor' } });
    await prisma.catalogSubgroup.create({ data: { id: 'sg3', groupId: 'g2', code: 'ROD', name: 'Rodamientos' } });
    await prisma.catalogSubgroup.create({ data: { id: 'sg4', groupId: 'g3', code: 'CON', name: 'Contactores' } });
    await prisma.catalogSubgroup.create({ data: { id: 'sg5', groupId: 'g4', code: 'BOM', name: 'Bombas' } });
    console.log('Created 5 catalog subgroups');
    
    // Catalog Categories
    await prisma.catalogCategory.create({ data: { id: 'cat1', subgroupId: 'sg1', code: 'PAR-DEL', name: 'Parachoque Delantero' } });
    await prisma.catalogCategory.create({ data: { id: 'cat2', subgroupId: 'sg2', code: 'FIL-DIE', name: 'Filtro Diesel' } });
    await prisma.catalogCategory.create({ data: { id: 'cat3', subgroupId: 'sg3', code: 'ROD-6205', name: 'Rodamiento 6205' } });
    await prisma.catalogCategory.create({ data: { id: 'cat4', subgroupId: 'sg4', code: 'CON-TRI', name: 'Contactor Trifásico' } });
    console.log('Created 4 catalog categories');
    
    // Brands
    await prisma.brand.create({ data: { id: 'b1', name: 'Fleetguard', normalizedName: 'FLEETGUARD' } });
    await prisma.brand.create({ data: { id: 'b2', name: 'SKF', normalizedName: 'SKF' } });
    await prisma.brand.create({ data: { id: 'b3', name: 'Schneider', normalizedName: 'SCHNEIDER' } });
    await prisma.brand.create({ data: { id: 'b4', name: 'Baldwin', normalizedName: 'BALDWIN' } });
    await prisma.brand.create({ data: { id: 'b5', name: 'Foton', normalizedName: 'FOTON' } });
    console.log('Created 5 brands');
    
    // Units of Measure
    await prisma.unitOfMeasure.create({ data: { id: 'uom1', code: 'PZA', name: 'Pieza' } });
    await prisma.unitOfMeasure.create({ data: { id: 'uom2', code: 'LT', name: 'Litro' } });
    await prisma.unitOfMeasure.create({ data: { id: 'uom3', code: 'KG', name: 'Kilogramo' } });
    await prisma.unitOfMeasure.create({ data: { id: 'uom4', code: 'M', name: 'Metro' } });
    console.log('Created 4 units of measure');
    
    console.log('\nSeed completed successfully!');
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
