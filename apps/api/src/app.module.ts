import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { CatalogosModule } from './modulos/catalogos/catalogos.module';
import { SaludModule } from './modulos/salud/salud.module';
import { AutenticacionModule } from './modulos/autenticacion/autenticacion.module';
import { SolicitudesModule } from './modulos/solicitudes/solicitud.module';
import { AlmacenModule } from './modulos/almacen/almacen.module';
import { ContabilidadModule } from './modulos/contabilidad/contabilidad.module';
import { RevisionFinalModule } from './modulos/revision-final/revision-final.module';
import { AuditoriaModule } from './modulos/auditoria/auditoria.module';
import { ArchivosModule } from './modulos/archivos/archivos.module';
import { OrganizacionModule } from './modulos/organizacion/organizacion.module';
import { ImportacionesModule } from './modulos/importaciones/importaciones.module';
import { NotificacionesModule } from './modulos/notificaciones/notificaciones.module';
import { PanelModule } from './modulos/panel/panel.module';
import { ProfitModule } from './modulos/profit/profit.module';
import { PrismaModule } from './comun/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env.local'), join(__dirname, '..', '.env')],
    }),
    PrismaModule,
    SaludModule,
    CatalogosModule,
    AutenticacionModule,
    SolicitudesModule,
    AlmacenModule,
    ContabilidadModule,
    RevisionFinalModule,
    AuditoriaModule,
    ArchivosModule,
    OrganizacionModule,
    ImportacionesModule,
    NotificacionesModule,
    PanelModule,
    ProfitModule,
  ],
})
export class AppModule {}
