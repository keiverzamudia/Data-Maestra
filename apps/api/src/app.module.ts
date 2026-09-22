import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { CatalogosModule } from './modulos/catalogos/catalogos.module';
import { SaludModule } from './modulos/salud/salud.module';
import { AutenticacionModule } from './modulos/autenticacion/autenticacion.module';
import { SolicitudesModule } from './modulos/solicitudes/solicitud.module';
import { AlmacenModule } from './modulos/almacen/almacen.module';
import { AprobacionAlmacenModule } from './modulos/aprobacion-almacen/aprobacion-almacen.module';
import { ContabilidadModule } from './modulos/contabilidad/contabilidad.module';
import { AuditoriaModule } from './modulos/auditoria/auditoria.module';
import { ArchivosModule } from './modulos/archivos/archivos.module';
import { OrganizacionModule } from './modulos/organizacion/organizacion.module';
import { ImportacionesModule } from './modulos/importaciones/importaciones.module';
import { NotificacionesModule } from './modulos/notificaciones/notificaciones.module';
import { PanelModule } from './modulos/panel/panel.module';
import { ProfitModule } from './modulos/profit/profit.module';
import { UsuariosModule } from './modulos/usuarios/usuarios.module';
import { RolesModule } from './modulos/roles/roles.module';
import { MatchingModule } from './modulos/matching/matching.module';
import { MantenimientoModule } from './modulos/mantenimiento/mantenimiento.module';
import { PrismaModule } from './comun/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Prioridad: perfil de worktree (<repoRoot>/.env.local, no versionado) →
      // overrides locales de la API → defaults de la API. El primer archivo gana.
      envFilePath: [
        join(__dirname, '..', '..', '..', '.env.local'),
        join(__dirname, '..', '.env.local'),
        join(__dirname, '..', '.env'),
      ],
    }),
    PrismaModule,
    SaludModule,
    CatalogosModule,
    AutenticacionModule,
    SolicitudesModule,
    AlmacenModule,
    AprobacionAlmacenModule,
    ContabilidadModule,
    AuditoriaModule,
    ArchivosModule,
    OrganizacionModule,
    ImportacionesModule,
    NotificacionesModule,
    PanelModule,
    ProfitModule,
    UsuariosModule,
    RolesModule,
    MatchingModule,
    MantenimientoModule,
  ],
})
export class AppModule {}
