-- CreateTable
CREATE TABLE "MexicanNnp" (
    "id" SERIAL NOT NULL,
    "numeracion_inicial" BIGINT NOT NULL,
    "numeracion_final" BIGINT NOT NULL,
    "modalidad" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MexicanNnp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MexicanNnp_numeracion_inicial_numeracion_final_idx" ON "MexicanNnp"("numeracion_inicial", "numeracion_final");

-- CreateIndex
CREATE UNIQUE INDEX "MexicanNnp_numeracion_inicial_numeracion_final_key" ON "MexicanNnp"("numeracion_inicial", "numeracion_final");
