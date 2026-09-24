-- Descripción ajustada por Almacén en RequestData (máx. 100, opcional).
-- Si existe, sustituye a requestedDescription como art_des en Profit.
ALTER TABLE "request_data" ADD COLUMN "adjusted_description" TEXT;
