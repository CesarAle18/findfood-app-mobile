/**
 * Terms and Conditions of FindFood, including the personal-data policy, shown by
 * `TermsModal`. DRAFT pending legal review: this file is the single place to replace the
 * text; keep `TERMS_UPDATED_AT` in step with every change of the content.
 */

export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export const TERMS_UPDATED_AT = "17 de noviembre de 2026";

export const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    title: "1. Objeto y aceptación",
    paragraphs: [
      "Estos Términos y Condiciones regulan el acceso y el uso de FindFood, una plataforma que conecta a personas y organizaciones que donan alimentos con voluntarios que los recogen y los entregan a quienes los necesitan en Colombia.",
      "Al crear una cuenta o al marcar la casilla de aceptación, declaras que leíste, entendiste y aceptas estos Términos y Condiciones y la Política de Tratamiento de Datos Personales incluida en ellos. Si no estás de acuerdo, no debes usar la plataforma.",
    ],
  },
  {
    title: "2. Definiciones",
    paragraphs: [
      "Plataforma: la aplicación móvil, el sitio web y los servicios asociados de FindFood.",
      "Usuario: toda persona que se registra y usa la plataforma, ya sea como donante o como voluntario.",
      "Donante: el usuario que publica alimentos para donarlos.",
      "Voluntario: el usuario que, tras ser verificado, recoge las donaciones y las entrega en su destino.",
      "Donación: el conjunto de alimentos publicado por un donante, con su información, su dirección y su ventana de recogida.",
    ],
  },
  {
    title: "3. Registro y cuenta",
    paragraphs: [
      "Para usar la plataforma debes registrarte con datos veraces, completos y actualizados, y mantenerlos así mientras tengas una cuenta.",
      "Debes ser mayor de edad según la ley colombiana. Al registrarte declaras que cumples este requisito.",
      "Eres responsable de custodiar tus credenciales y de toda actividad realizada desde tu cuenta. Si sospechas un uso no autorizado, cambia tu contraseña y avísanos por el canal de contacto.",
      "Al registrarte con correo electrónico debes verificarlo con el código que te enviamos antes de usar la plataforma.",
      "Si inicias sesión con Google, recibimos de Google tu nombre y tu correo electrónico para crear o identificar tu cuenta; el uso de tu cuenta de Google se rige además por las condiciones de Google.",
    ],
  },
  {
    title: "4. Obligaciones del donante",
    paragraphs: [
      "Donar únicamente alimentos aptos para el consumo humano, en buen estado y con fechas de vencimiento vigentes al momento de la recogida.",
      "Entregar los alimentos con un empaque adecuado y en condiciones de higiene que eviten su contaminación o deterioro.",
      "Publicar información veraz sobre los alimentos, sus cantidades, su estado, la dirección de recogida y las condiciones especiales de manipulación o conservación.",
      "Estar disponible durante la ventana de recogida indicada, o actualizarla con anticipación si cambia.",
      "Cancelar la donación en la plataforma tan pronto como sepa que no podrá entregarla, para que el voluntario no se desplace en vano.",
    ],
  },
  {
    title: "5. Obligaciones del voluntario",
    paragraphs: [
      "Completar la verificación de identidad y, cuando corresponda, la de su vehículo, con documentos auténticos y vigentes, antes de aceptar donaciones.",
      "Recoger y entregar las donaciones que acepta de forma oportuna, dentro de la ventana de recogida y por el medio de transporte registrado.",
      "Manipular los alimentos con cuidado, conservar la cadena de frío cuando el alimento lo requiera y no abrir, fraccionar ni consumir las donaciones.",
      "Registrar las evidencias fotográficas que la plataforma solicite en la recogida y en la entrega.",
      "Rechazar una donación cuando los alimentos no estén en condiciones aptas, indicando el motivo en la plataforma.",
    ],
  },
  {
    title: "6. Cancelaciones, rechazos y reasignación",
    paragraphs: [
      "El donante puede cancelar una donación antes de que sea recogida. El voluntario puede liberar una donación aceptada o rechazarla con motivo; en esos casos la plataforma puede volver a ofrecerla a otros voluntarios.",
      "Las cancelaciones o los rechazos reiterados sin justificación pueden dar lugar a las medidas previstas en la sección de suspensión de cuentas.",
    ],
  },
  {
    title: "7. Ubicación, notificaciones y cámara",
    paragraphs: [
      "La ubicación se usa para fijar la dirección de recogida, mostrar donaciones cercanas y orientar la ruta de recogida y entrega.",
      "Las notificaciones se usan para avisarte sobre el estado de tus donaciones, nuevas donaciones disponibles y novedades de tu cuenta.",
      "La cámara y la galería se usan para tomar o elegir fotos de los alimentos, las evidencias de recogida y entrega y los documentos de verificación.",
      "Puedes negar o retirar estos permisos en cualquier momento desde la configuración de tu dispositivo; algunas funciones dejarán de estar disponibles mientras estén desactivados.",
    ],
  },
  {
    title: "8. Tratamiento de datos personales",
    paragraphs: [
      "FindFood es responsable del tratamiento de tus datos personales, que se realiza conforme a la Ley 1581 de 2012, el Decreto 1377 de 2013 y las demás normas colombianas aplicables.",
      "Tratamos datos de identificación (nombres, apellidos y documento de identidad), de contacto (correo electrónico y celular), de ubicación, fotografías de los alimentos y evidencias de recogida y entrega, y los documentos de identidad y del vehículo que aportan los voluntarios para su verificación.",
      "Las finalidades del tratamiento son: crear y administrar tu cuenta; verificar la identidad de los voluntarios; publicar, asignar, rastrear y cerrar las donaciones; comunicar entre sí a donantes y voluntarios en lo necesario para cada donación; enviarte notificaciones del servicio; prevenir fraudes y usos indebidos; atender tus consultas y reclamos, y cumplir las obligaciones legales.",
      "Como titular tienes derecho a conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización otorgada; ser informado sobre el uso que se les ha dado; presentar quejas ante la Superintendencia de Industria y Comercio por infracciones a la ley; revocar la autorización y solicitar la supresión de tus datos cuando no exista un deber legal o contractual de conservarlos, y acceder de forma gratuita a ellos.",
      "Los documentos de identidad aportados para la verificación se conservan solo durante el tiempo necesario para completarla y para atender las obligaciones legales que de ella se deriven.",
      "Aplicamos medidas técnicas, humanas y administrativas razonables para proteger tus datos frente a su pérdida, consulta, uso o acceso no autorizado o fraudulento.",
      "Puedes ejercer tus derechos y presentar consultas o reclamos a través del canal de contacto publicado en la aplicación. Las consultas se atienden en un plazo máximo de diez días hábiles y los reclamos en un plazo máximo de quince días hábiles, en los términos de la Ley 1581 de 2012.",
      "Al aceptar estos términos autorizas de manera previa, expresa e informada el tratamiento de tus datos para las finalidades descritas.",
    ],
  },
  {
    title: "9. Gratuidad y ausencia de relación laboral",
    paragraphs: [
      "El uso de la plataforma es gratuito. Las donaciones no se venden ni dan lugar a pago alguno.",
      "El voluntariado es una actividad libre y sin remuneración. Su ejercicio no crea relación laboral, de subordinación ni de prestación de servicios entre el voluntario y FindFood.",
    ],
  },
  {
    title: "10. Limitación de responsabilidad",
    paragraphs: [
      "FindFood es un intermediario tecnológico que facilita el contacto entre donantes y voluntarios. No produce, almacena, transporta ni inspecciona los alimentos, y no garantiza su calidad, su inocuidad ni su estado.",
      "Cada donante responde por los alimentos que dona y cada voluntario por su manipulación y entrega. FindFood no responde por los daños que se deriven del incumplimiento de estos términos por parte de los usuarios, salvo en los casos en que la ley disponga otra cosa.",
    ],
  },
  {
    title: "11. Suspensión de cuentas",
    paragraphs: [
      "FindFood puede suspender o cancelar una cuenta cuando detecte información falsa, incumplimiento de estos términos, conductas que pongan en riesgo a otros usuarios o a quienes reciben las donaciones, o usos contrarios a la ley.",
      "Cuando sea posible, te informaremos el motivo y podrás pedir la revisión de la decisión a través del canal de contacto.",
    ],
  },
  {
    title: "12. Modificaciones de los términos",
    paragraphs: [
      "FindFood puede modificar estos términos. La fecha de la última actualización aparece al inicio del documento. Cuando los cambios sean relevantes te lo informaremos en la aplicación y, si es necesario, te pediremos aceptarlos de nuevo para seguir usando la plataforma.",
    ],
  },
  {
    title: "13. Ley aplicable y jurisdicción",
    paragraphs: [
      "Estos términos se rigen por las leyes de la República de Colombia. Las controversias que surjan de ellos se someterán a los jueces competentes de Colombia, sin perjuicio de los derechos que la ley reconoce a los consumidores y a los titulares de datos personales.",
    ],
  },
  {
    title: "14. Contacto",
    paragraphs: [
      "Para preguntas sobre estos términos, sobre el tratamiento de tus datos o para ejercer tus derechos, escríbenos a través del canal de contacto publicado en la aplicación.",
    ],
  },
];
