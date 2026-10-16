/**
 * A catalog reason (`motivos` of one `ambito`) plus the comment some reasons require.
 *
 * The API answers 422 `comentario-requerido` when a reason with `requiere_comentario` comes
 * without an `observacion`; `validateMotivo` catches it before submitting.
 */
import { View } from "react-native";

import { QueryContent } from "@/components/findfood/feedback";
import { Copy, Field, SelectField } from "@/components/findfood/ui";
import { colors } from "@/design/tokens";
import { useMotivos, type AmbitoMotivo, type MotivoDto } from "@/services/catalogos";

export interface MotivoSelection {
  motivoId?: number;
  comentario: string;
}

const MOTIVO_REQUERIDO = "Selecciona un motivo.";
const COMENTARIO_REQUERIDO = "Escribe un comentario para este motivo.";

/** The validation message for the selection, or null when it can be sent. */
export function validateMotivo(
  selection: MotivoSelection,
  motivos: readonly MotivoDto[],
): string | null {
  const motivo = motivos.find((candidate) => candidate.id === selection.motivoId);
  if (!motivo) return MOTIVO_REQUERIDO;
  if (motivo.requiere_comentario && selection.comentario.trim() === "") {
    return COMENTARIO_REQUERIDO;
  }
  return null;
}

/** The `{ motivo_id, observacion? }` body of a validated selection. */
export function motivoBody(selection: MotivoSelection & { motivoId: number }): {
  motivo_id: number;
  observacion?: string;
} {
  const observacion = selection.comentario.trim();
  return observacion === ""
    ? { motivo_id: selection.motivoId }
    : { motivo_id: selection.motivoId, observacion };
}

export function MotivoField({
  ambito,
  value,
  onChange,
  error,
}: {
  ambito: AmbitoMotivo;
  value: MotivoSelection;
  onChange: (value: MotivoSelection) => void;
  /** Message from `validateMotivo`, shown below the fields. */
  error?: string | null;
}) {
  const motivos = useMotivos(ambito);
  return (
    <QueryContent
      query={motivos}
      loadingLabel="Cargando motivos"
      errorTitle="No pudimos cargar los motivos"
    >
      {(lista) => (
        <MotivoInputs motivos={lista} value={value} onChange={onChange} error={error} />
      )}
    </QueryContent>
  );
}

function MotivoInputs({
  motivos,
  value,
  onChange,
  error,
}: {
  motivos: MotivoDto[];
  value: MotivoSelection;
  onChange: (value: MotivoSelection) => void;
  error?: string | null;
}) {
  const { motivoId, comentario } = value;
  const selected = motivos.find((motivo) => motivo.id === motivoId);
  // The comment field shows its own message; any other one goes below both fields.
  const comentarioError = error === COMENTARIO_REQUERIDO ? error : undefined;
  const generalError = comentarioError ? null : error;
  return (
    <View style={{ gap: 12 }}>
      <SelectField
        label="Motivo *"
        value={motivoId === undefined ? "" : String(motivoId)}
        options={motivos.map((motivo) => ({ label: motivo.nombre, value: String(motivo.id) }))}
        onChange={(id) => onChange({ motivoId: Number(id), comentario })}
      />
      {selected?.requiere_comentario ? (
        <Field
          label="Comentario *"
          value={comentario}
          onChangeText={(text) => onChange({ motivoId, comentario: text })}
          placeholder="Cuéntanos qué pasó"
          multiline
          error={comentarioError}
        />
      ) : null}
      {generalError ? (
        <View accessible accessibilityRole="alert">
          <Copy style={{ color: colors.danger, fontSize: 12 }}>{generalError}</Copy>
        </View>
      ) : null}
    </View>
  );
}
