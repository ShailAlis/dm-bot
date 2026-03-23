// ============================================================
//  eeeg.js — Generadores de mundo inspirados en EEEG
//  Importar en index.js con: const EEEG = require('./eeeg')
// ============================================================

const r = (arr, fallback = 'desconocido') => {
  if (!Array.isArray(arr) || arr.length === 0) return fallback
  return arr[Math.floor(Math.random() * arr.length)]
}
const dice = (n, sides) => Array.from({length: n}, () => Math.floor(Math.random() * sides) + 1).reduce((a, b) => a + b, 0)
const pickMany = (arr, count = 1) => {
  if (!Array.isArray(arr) || arr.length === 0 || count <= 0) return []

  const pool = [...arr]
  const picks = []
  const limit = Math.min(count, pool.length)

  while (picks.length < limit) {
    const index = Math.floor(Math.random() * pool.length)
    picks.push(pool.splice(index, 1)[0])
  }

  return picks
}

// ── DATOS BASE ────────────────────────────────────────────────

const data = {

  // ── NOMBRES ─────────────────────────────────────────────────
  townNames: {
    prefix: ['Ash','Black','Bright','Broken','Cold','Dark','Dead','Deep','Dun','East','Elder','Ember','Ever','Fair','Far','Frost','Gold','Green','Grey','Hard','High','Hill','Hollow','Iron','Last','Lone','Long','Lost','Low','Marsh','Mist','Moon','New','Night','North','Oak','Old','Over','Pine','Rain','Red','River','Rock','Rose','Rune','Rush','Salt','Sand','Shadow','Silver','South','Star','Stone','Storm','Straw','Sun','Swift','Tall','Timber','Twin','Under','Vale','West','White','Wild','Wind','Winter','Wood'],
    suffix: ['barrow','beck','borough','bridge','brook','burg','burn','by','caster','cliff','dale','den','dike','don','dun','field','fold','ford','gate','glen','grove','ham','harbor','haven','heath','hill','holm','holt','keep','lake','lane','lea','lock','mead','mere','mill','mire','moor','mount','mouth','ness','pool','port','reach','ridge','rift','rise','run','shore','stead','strand','thorpe','ton','vale','veil','wick','wood','worth'],
  },

  townTypes: ['aldea','pueblo','villa','ciudad','asentamiento','enclave','bastión','fortaleza','puerto','mercado'],

  townEvents: [
    'se celebra una feria anual de cosecha',
    'hay tensión por un impuesto reciente del señor feudal',
    'un viajero misterioso llegó hace días y nadie sabe quién es',
    'se rumorea que hay un ladrón suelto robando en los hogares',
    'se prepara una boda entre dos familias rivales',
    'un monje errante predica el fin de los tiempos',
    'acaba de terminar una disputa entre dos gremios',
    'los niños hablan de criaturas en el bosque cercano',
    'el pozo principal ha dado agua con sabor extraño',
    'una plaga de ratas ha invadido los graneros',
    'se celebra el aniversario de la fundación del pueblo',
    'hay escasez de sal y los precios se han disparado',
    'un noble de paso reclamó alojamiento y no se va',
    'tres granjeros han desaparecido en la última semana',
    'hay un torneo de lucha organizado por el tabernero',
    'alguien encontró una moneda antigua de valor desconocido',
    'el sacerdote local lleva días encerrado en el templo',
    'se buscan aventureros para escoltar una caravana',
  ],

  townLandmarks: [
    'una estatua de piedra de un héroe olvidado en la plaza',
    'un árbol centenario que sirve de punto de reunión',
    'un puente de piedra con inscripciones rúnicas',
    'una fuente con agua que dicen tiene propiedades curativas',
    'las ruinas de una torre antigua en las afueras',
    'un molino de agua que funciona día y noche',
    'un tablón de anuncios lleno de carteles descoloridos',
    'una horca en desuso que nadie se atreve a derribar',
    'un mercado cubierto con techo de madera carcomida',
    'una pequeña capilla dedicada a una deidad menor',
    'un cementerio con lápidas de diferentes épocas',
    'un estanque donde los lugareños pescan y charlan',
    'un cartel pintado a mano que indica distancias a otras ciudades',
    'una posada construida sobre los cimientos de algo más antiguo',
    'una herrería cuyo martilleo se escucha a media legua',
  ],

  // ── NPCs ─────────────────────────────────────────────────────
  npcMoods: ['irritado','tranquilo','pensativo','nervioso','contento','melancólico','suspicaz','distraído','animado','exhausto','borracho','asustado','eufórico','aburrido','hosco'],

  npcPhysicalTraits: [
    'una cicatriz que cruza la mejilla izquierda',
    'unos ojos de colores distintos',
    'el dedo meñique de la mano derecha amputado',
    'un tatuaje de serpiente en el cuello',
    'una nariz rota mal curada',
    'cabello prematuramente blanco pese a su juventud',
    'una marca de nacimiento en forma de media luna en la frente',
    'dientes de oro en la parte delantera',
    'una oreja parcialmente arrancada',
    'una cojera notable en la pierna izquierda',
    'quemaduras antiguas en el dorso de las manos',
    'cejas permanentemente fruncidas que le dan aspecto severo',
    'pecas en abundancia hasta en las orejas',
    'una barba o melena absolutamente desaliñada',
    'unos dedos inusualmente largos y finos',
    'una voz sorprendentemente aguda para su complexión',
    'un tic nervioso en el párpado derecho',
    'manos encallecidas como cuero viejo',
  ],

  npcPockets: [
    '5 monedas de cobre y un botón roto',
    'una moneda extranjera de procedencia desconocida',
    'un trozo de queso envuelto en trapo',
    'un cuchillo de bolsillo con el mango tallado',
    'una carta de amor a medio escribir',
    'dados cargados pintados de negro',
    'un diente envuelto en tela',
    'un sello de cera con un escudo que nadie reconoce',
    'hierbas medicinales con olor fuerte',
    'una pequeña figura de madera tallada a mano',
    'un frasco vacío que aún huele a veneno',
    'un recibo de deuda firmado por alguien importante',
    'tres monedas de plata y un pellizco de sal',
    'un mapa dibujado en piel que parece incompleto',
    'una pata de conejo sujeta con hilo rojo',
    'un trozo de carbón y papel arrugado con números',
    'una bola de pelo de animal de origen incierto',
    'nada en absoluto, los bolsillos cosidos desde dentro',
  ],

  npcSecrets: [
    'debe una cantidad desorbitada de dinero a alguien peligroso',
    'es un espía al servicio de una facción rival',
    'mató a alguien hace años y nunca fue descubierto',
    'tiene familia en otra ciudad bajo un nombre falso',
    'sabe dónde está enterrado un tesoro pero tiene miedo',
    'es el heredero legítimo de una casa noble caída',
    'practica una religión prohibida en secreto',
    'ha estado vendiendo información al mejor postor',
    'sufre una maldición que intenta ocultar',
    'fue aventurero en su juventud y tiene sangre en las manos',
    'robó algo a alguien que aún le busca',
    'es inmune al veneno por razones que no entiende',
    'puede ver brevemente el futuro en sueños pero no lo controla',
    'tiene un contrato firmado con una entidad que no era lo que parecía',
    'lleva años fingiendo ser quien no es',
  ],

  npcIdleActions: [
    'puliendo un cuchillo con un trapo',
    'masticando algo con expresión pensativa',
    'echando un vistazo al exterior cada pocos minutos',
    'contando monedas una y otra vez',
    'tamborileando los dedos sobre la mesa',
    'leyendo un pergamino con el ceño fruncido',
    'afilando una pluma con un cuchillo pequeño',
    'mirando fijamente la llama de una vela',
    'hablando solo en voz muy baja',
    'haciendo girar un anillo entre los dedos',
    'bebiendo despacio de una taza casi vacía',
    'remendando una prenda de ropa con torpeza',
    'dibujando distraidamente sobre la mesa con un dedo mojado',
    'mirando las manos como si buscara algo en ellas',
    'revisando el contenido de una bolsa una y otra vez',
  ],

  // ── TABERNAS ─────────────────────────────────────────────────
  tavernNamePrefixes: ['La','El','Los','Las','The','O\'','Al'],
  tavernNameNouns: ['Dragón Dormido','Hacha Oxidada','Copa Rota','Lobo Plateado','Ganso Borracho','Espada Partida','Cerdo Bailarín','Estrella Negra','Cabeza de Troll','Mano Perdida','Luna Roja','Ojo del Cuervo','Jarra Sin Fondo','Puño de Hierro','Rata Alegre','Grifo Cojo','Farol Verde','Ancla Rota','Ciervo Dorado','Escudo Caído'],

  tavernFeatures: {
    cheap: [
      'el suelo de tierra apisonada está pegajoso por la cerveza derramada',
      'hay ratas corriendo bajo las mesas pero nadie parece importarle',
      'las sillas son de cuatro tipos distintos, ninguna del mismo juego',
      'la barra está tan rayada que parece un mapa de batallas',
      'velas a medio consumir chorrean cera sobre mesas y clientes',
      'las paredes tienen nombres grabados a cuchillo por cientos de parroquianos',
      'un gato enorme y gordo duerme en el centro de la barra sin que nadie lo mueva',
      'hay un agujero en el techo tapado con paja que gotea cuando llueve',
    ],
    average: [
      'una chimenea de piedra crepita en un rincón, rodeada de los mejores asientos',
      'hay trofeos de caza desiguales colgados en las paredes',
      'unos carteles dibujados a mano anuncian las especialidades de la semana',
      'una colección de jarras de peltre cuelga del techo como decoración',
      'el suelo de madera rechina con un ritmo casi musical al caminar',
      'hay una tablilla de pizarra con deudas pendientes visible desde la barra',
      'un perro grande y viejo duerme cerca de la chimenea y nadie lo mueve',
      'retratos mal pintados de clientes habituales decoran una pared entera',
    ],
    wealthy: [
      'lámparas de aceite de cristal iluminan el local con una cálida luz dorada',
      'los muebles son de madera pulida, todos del mismo estilo',
      'hay un escenario pequeño pero bien construido en un extremo de la sala',
      'las jarras son de estaño bruñido y están siempre llenas antes de vaciarse',
      'un tapiz enorme narra la historia del lugar con figuras bordadas',
      'hay una sala privada separada por una cortina gruesa para reuniones discretas',
      'el suelo de piedra está tan limpio que casi da vergüenza pisarlo',
      'una chimenea doble calienta la sala entera incluso en pleno invierno',
    ],
  },

  tavernRumors: [
    'dicen que el tabernero esconde algo bajo las tablas del suelo',
    'un aventurero murió aquí hace un mes y nadie sabe quién reclamó el cuerpo',
    'el vino que sirven viene de un lugar que prefieren no nombrar',
    'tres noches seguidas alguien ha robado en las habitaciones sin dejar rastro',
    'el cocinero es en realidad un antiguo asesino retirado',
    'el dueño debe dinero a la familia equivocada y lo saben todos menos él',
    'hay una carta enterrada en el jardín trasero que cambiaría muchas cosas',
    'el fantasma del antiguo propietario aparece los martes por la noche',
    'la chica que sirve las mesas es la hija ilegítima de un noble local',
    'alguien dejó una bolsa de oro hace semanas y nadie la ha reclamado',
    'el sótano conecta con un túnel que lleva a quién sabe dónde',
    'el barril de la esquina nunca se vacía por más que sirvan de él',
  ],

  tavernSpecialBrews: [
    { name: 'Lágrima de Enano', type: 'aguardiente', cost: 8, desc: 'Un licor turbio y oscuro que sabe a carbón y miel quemada. Deja la lengua entumecida durante una hora.' },
    { name: 'Sangre de Dragón', type: 'cerveza especiada', cost: 6, desc: 'Una cerveza de color rojo intenso con sabor picante. Los valientes dicen que calienta desde dentro en pleno invierno.' },
    { name: 'Susurro Élfico', type: 'vino claro', cost: 12, desc: 'Un vino pálido y delicado con aroma floral. Suave al paladar pero traicionero: embriaga sin avisar.' },
    { name: 'Agua del Olvido', type: 'destilado', cost: 15, desc: 'Un líquido transparente sin olor. Se dice que quien bebe dos copas no recuerda la noche. Ideal para algunos, peligroso para otros.' },
    { name: 'Bilis de Troll', type: 'cerveza fuerte', cost: 4, desc: 'Densa, amarga y de color verdoso. Huele peor de lo que sabe, pero sabe bastante mal también.' },
    { name: 'Miel de Luna', type: 'hidromiel', cost: 9, desc: 'Un hidromiel suave elaborado con flores nocturnas. De sabor dulce con un regusto amargo que hace que vuelvas a probar.' },
    { name: 'Polvo de Estrellas', type: 'licor mágico', cost: 25, desc: 'Un líquido azul que destella con pequeñas chispas. Dicen que tras beberlo sueñas despierto durante unos minutos.' },
    { name: 'Vinagre del Diablo', type: 'cerveza ácida', cost: 3, desc: 'Exactamente lo que el nombre promete. El tabernero la sirve a quien se queja demasiado.' },
  ],

  tavernEvents: [
    'dos hombres están a punto de llegar a las manos por una deuda de cartas',
    'un bardo desafina deliberadamente para que le paguen por callarse',
    'alguien está llorando en un rincón y nadie se atreve a preguntar por qué',
    'una apuesta está reuniendo espectadores alrededor de una mesa',
    'el tabernero está echando a alguien a rastras hacia la puerta',
    'un anciano está contando una historia que todos han escuchado mil veces pero siguen escuchando',
    'dos mujeres hablan en voz baja con expresión muy seria y paran al verte',
    'alguien acaba de romper una silla y el silencio lo llena todo durante tres segundos',
    'un peregrino borracho está predicando desde encima de una mesa',
    'un mago amateur está intentando hacer trucos de cartas y fallando estrepitosamente',
    'hay una mancha de sangre fresca en el suelo que nadie limpia ni menciona',
    'un gato ha robado un trozo de carne y media taberna lo está persiguiendo',
  ],

  // ── EDIFICIOS ─────────────────────────────────────────────────
  buildings: {
    smithy: {
      notableFeature: [
        'el olor a metal caliente y carbón impregna la ropa desde la calle',
        'hay espadas a medio terminar colgadas de ganchos en la pared',
        'un aprendiz quemado en tres dedos sigue trabajando sin quejarse',
        'las paredes están ennegrecidas hasta el techo por años de trabajo',
        'hay un yunque tan grande que debieron construir la herrería alrededor',
        'una colección de herramientas rotas decora la entrada como trofeos',
      ],
      specialty: [
        'armas con inscripciones rúnicas de dudosa autenticidad pero buen aspecto',
        'reparaciones rápidas sin preguntas sobre el origen de las piezas',
        'herraduras encantadas que supuestamente dan suerte al caballo',
        'armaduras ligeras hechas a medida para quien tenga paciencia',
        'cuchillos equilibrados perfectamente para lanzar o cortar',
        'trabajo honesto a precios razonables, sin florituras',
      ],
    },
    alchemist: {
      notableFeature: [
        'el cristal de las ventanas está permanentemente opaco de vapores',
        'hay plantas extrañas creciendo en macetas de colores que no tienen nombre',
        'un olor dulzón y ligeramente nauseabundo flota en el aire',
        'estantes hasta el techo llenos de frascos etiquetados con letra diminuta',
        'hay manchas de quemaduras en el suelo que nadie ha intentado limpiar',
        'un esqueleto de animal desconocido cuelga del techo como decoración',
      ],
      specialty: [
        'pociones de curación de eficacia variable pero precio justo',
        'venenos de acción lenta y rastro difícil de detectar',
        'ungüentos para cicatrizar que huelen horrible pero funcionan',
        'explosivos de bolsillo para quien sepa usarlos sin perder los dedos',
        'tintes de cabello mágicos que duran exactamente tres días',
        'antídotos para prácticamente todo si tienes el dinero suficiente',
      ],
    },
    generalStore: {
      notableFeature: [
        'hay tantas cosas amontonadas que moverse requiere planificación',
        'el dueño sabe exactamente dónde está todo pese al caos aparente',
        'hay un barril de manzanas en la entrada que siempre parece lleno',
        'las etiquetas de los precios están escritas en tres idiomas distintos',
        'hay una sección trasera separada por una cortina que no se enseña',
        'el gato de la tienda duerme sobre la caja y nadie lo mueve',
      ],
      specialty: [
        'raciones de viaje que duran más de lo que debería ser posible',
        'cuerdas y herramientas de todo tipo a precios razonables',
        'información local de valor incalculable incluida con cada compra',
        'productos de procedencia cuestionable a precios muy atractivos',
        'mapas de la región, algunos más fiables que otros',
        'los últimos chismes del pueblo, gratis con cualquier compra',
      ],
    },
    temple: {
      notableFeature: [
        'el incienso es tan denso que cuesta ver al fondo de la sala',
        'hay ofrendas acumuladas de semanas que nadie ha recogido',
        'las velas nunca parecen consumirse del todo',
        'hay un mural en el techo que cambia dependiendo del ángulo de la luz',
        'el suelo de mármol está tan pulido que refleja como un espejo',
        'hay un pozo en el interior que según dicen no tiene fondo',
      ],
      specialty: [
        'bendiciones de viaje que dan una ligera pero real sensación de protección',
        'absoluciones rápidas para quienes tienen prisa y presupuesto',
        'asesoramiento espiritual de dudosa utilidad pero sincero',
        'exorcismos con garantía limitada de devolución de la inversión',
        'profecías vagas que siempre resultan acertadas en retrospectiva',
        'agua bendita en cantidad industrial a precio razonable',
      ],
    },
  },

  // ── MISIONES / PLOTHOOKS ──────────────────────────────────────
  plotHooks: [
    { summary: 'El granjero desaparecido', desc: 'Un granjero no regresó del campo hace tres días. Su esposa no llora, lo cual es extraño. Sus vecinos evitan hablar del asunto.' },
    { summary: 'La carta sin destinatario', desc: 'Alguien os entrega una carta sellada pidiéndoos que la entreguéis en una dirección que ya no existe. Dentro hay un mapa.' },
    { summary: 'El niño que vio algo', desc: 'Un niño jura haber visto a alguien enterrar algo en el cementerio a medianoche. Nadie le cree. Él sí lo vio.' },
    { summary: 'La deuda del muerto', desc: 'Un hombre os aborda diciendo que el difunto padre de uno de vosotros le debía dinero. Mucho dinero. Y quiere cobrar.' },
    { summary: 'El ladrón generoso', desc: 'Alguien está robando en las casas de los ricos del pueblo pero dejando monedas en las casas de los pobres. La guardia quiere capturarlo. Los pobres no.' },
    { summary: 'La bestia del pantano', desc: 'Algo mata ganado desde hace semanas. Los cazadores que fueron a buscarlo no regresaron. Eso fue la semana pasada.' },
    { summary: 'El mercader con prisa', desc: 'Un mercader os ofrece el doble de lo normal por escoltarle. No os dice a dónde. Tampoco os dice por qué tiene tanta prisa.' },
    { summary: 'La posada infestada', desc: 'Tres viajeros han muerto en la misma habitación de la posada en el último mes. El dueño dice que es mala suerte. Los fantasmas no están de acuerdo.' },
    { summary: 'El aprendiz que huyó', desc: 'Un aprendiz de mago desapareció con el libro de hechizos de su maestro. El maestro no quiere que nadie sepa qué contenía ese libro.' },
    { summary: 'La estatua que llora', desc: 'La estatua del héroe fundador del pueblo lleva tres días llorando sangre. El sacerdote dice que es un milagro. El alcalde dice que es pintura. Ninguno tiene razón.' },
    { summary: 'El testigo incómodo', desc: 'Alguien os contrata para proteger a un testigo. El testigo no sabe que le están buscando. Vosotros tampoco sabéis por qué.' },
    { summary: 'La subasta maldita', desc: 'Se subasta el contenido de la casa de un mago muerto. Cada objeto ha cambiado de manos tres veces en el último año. Cada propietario anterior ha sufrido mala suerte creciente.' },
    { summary: 'El precio de la cura', desc: 'Un curandero tiene la cura para una enfermedad que se extiende por el pueblo. El precio es hacer algo que preferiría no pedir directamente.' },
    { summary: 'La guardia corrupta', desc: 'Un guardia os extorsiona. Tiene a alguien como rehén. También tiene miedo de su propio superior, que es el problema real.' },
    { summary: 'El mapa del abuelo', desc: 'Un anciano os muestra un mapa de algo valioso que él ya no puede ir a buscar. Quiere la mitad. El mapa tiene décadas pero el lugar existe.' },
  ],

  // ── ENCUENTROS ───────────────────────────────────────────────
  encounters: {
    forest: [
      'un ciervo albino os observa desde los árboles sin huir',
      'encontráis los restos de un campamento abandonado a toda prisa',
      'un árbol caído bloquea el camino y debajo hay algo que se mueve',
      'una figura encapuchada se aleja entre los árboles al veros',
      'encontráis una trampa de caza que no es para animales pequeños',
      'pájaros que cantaban se callan todos al mismo tiempo',
      'hay huellas frescas que van en vuestra misma dirección pero de vuelta',
      'una cabaña abandonada con la puerta recién forzada desde dentro',
      'un niño sentado solo en un claro. Dice que espera a alguien. Lleva días esperando.',
      'un lobo enorme os sigue a distancia. No se acerca. No se va.',
    ],
    mountain: [
      'una avalancha de piedras bloquea el paso principal',
      'encontráis un refugio de montaña con provisiones para tres semanas y nadie dentro',
      'hay una inscripción tallada en la roca en un idioma que no reconocéis',
      'un águila gigante circunda sobre vosotros con algo en las garras',
      'el viento trae el sonido de tambores desde una dirección imposible de determinar',
      'encontráis el rastro de algo muy grande que arrastraba algo muy pesado',
      'hay una hoguera reciente. El fuego lleva horas apagado pero la madera aún humea.',
      'una manada de cabras montesas huye en pánico sin razón aparente',
    ],
    road: [
      'una caravana abandonada con las mercancías intactas y sin señales de los conductores',
      'un viajero herido tirado en el camino. Sus heridas son limpias, de espada.',
      'un destacamento de guardia os detiene para un registro "rutinario" con demasiado interés',
      'un carromato volcado con el dueño vivo pero atrapado y con mucha prisa',
      'dos grupos en los lados del camino os observan en silencio mientras pasáis',
      'un mensajero a caballo pasa a toda velocidad tirando un pergamino sin querer',
      'un puesto de peaje cuya tasa ha subido el doble desde la última vez que alguien pasó',
      'una mujer sola camina con paso decidido en sentido contrario. Os ignora completamente.',
    ],
    desert: [
      'un espejismo de ciudad que permanece aunque avancéis hacia él',
      'huesos de una caravana entera dispersos por el arena sin marcas de combate',
      'un pozo con agua pero con inscripciones que nadie ha traducido todavía',
      'un mercader solitario con productos que nadie en el desierto debería tener',
      'una tormenta de arena que parece moverse con intención',
      'huellas en la arena que comienzan de la nada y terminan igual',
    ],
    dungeon: [
      'una puerta que no debería estar aquí según el mapa',
      'marcas de garras en el suelo frescas, más grandes de lo esperado',
      'una habitación vacía con una mesa puesta para cenar, comida fresca incluida',
      'el sonido de alguien llorando que se detiene en cuanto hacéis ruido',
      'un corredor que termina en una pared que claramente es nueva',
      'antorchas encendidas que nadie ha puesto aquí y que llevan poco tiempo ardiendo',
    ],
  },

  // ── OBJETOS CURIOSOS ──────────────────────────────────────────
  curiosities: [
    'una moneda de un reino que no existe en ningún mapa conocido',
    'un ojo de vidrio que cambia de color según la hora del día',
    'una carta sellada con cera roja cuyo remitente es un nombre de persona muerta',
    'un cuchillo sin filo que nunca se mancha de óxido',
    'un espejo pequeño que siempre muestra el reflejo con un segundo de retraso',
    'una brújula que no señala el norte sino que gira lentamente sin parar',
    'un frasco con algo que se mueve dentro pero que no tiene abertura',
    'un trozo de metal frío al tacto que no calienta aunque lo sostengas horas',
    'un libro en blanco cuyas páginas huelen a humo reciente',
    'una llave sin cerradura conocida con un número grabado: 7',
    'un fragmento de mapa que muestra un lugar que debería estar a tres días de aquí',
    'una estatuilla de madera de una criatura que no reconocéis',
    'un anillo con una inscripción en el interior: "Devuélveme"',
    'un puñado de dientes humanos atados con hilo rojo',
    'un trozo de pergamino con una sola palabra repetida cien veces en letra muy pequeña',
    'una pequeña caja que suena a líquido al agitarla pero que no tiene tapa visible',
    'un guante de mano izquierda muy bien hecho, sin pareja',
    'una bolsa de monedas donde todas las monedas tienen la misma cara pero ninguna tiene reverso',
  ],

  // ── RUMORES ───────────────────────────────────────────────────
  rumors: [
    'dicen que el alcalde tiene una segunda familia en el pueblo del norte',
    'el sacerdote lleva semanas sin salir del templo y sus criados tampoco dicen nada',
    'alguien vio luz en la torre abandonada tres noches seguidas',
    'los enanos que trabajan en la mina han dejado de bajar al nivel tres',
    'un barco llegó al puerto y descargó cajas selladas de noche sin registrarlas',
    'el herrero está forjando armas en cantidad que ningún granjero necesita',
    'hay un niño en el pueblo que habla en sueños en un idioma que nadie reconoce',
    'dicen que la hija del noble local desapareció hace un mes pero nadie lo ha anunciado',
    'el bosque al este está más silencioso de lo normal desde hace semanas',
    'tres magos pasaron por el pueblo la semana pasada buscando algo. No dijeron qué.',
    'el posadero pagó sus deudas de golpe sin que nadie sepa de dónde sacó el dinero',
    'hay un extraño en la taberna que lleva cuatro días sin hablar con nadie ni salir',
    'alguien encontró una puerta en las alcantarillas que lleva a un lugar desconocido',
    'el capitán de la guardia lleva días nervioso y revisando los registros de entrada al pueblo',
    'dicen que una bruja nueva se ha instalado en la cabaña del bosque que llevaba años vacía',
    'un mercader ofrece el doble por información sobre viajeros que pasaron hace una semana',
  ],

}

Object.assign(data, {
  townProsperity: [
    'pobre pero resistente',
    'modesto y trabajador',
    'prospero a simple vista',
    'rico para su tamano',
    'tenso por una riqueza reciente',
    'decadente tras tiempos mejores',
  ],

  townIndustries: [
    'agricultura y molinos',
    'mineria y fundicion',
    'pesca, salazones y barcazas',
    'madera, carbon y caza',
    'comercio de paso y peajes',
    'ganado, curtidos y lana',
    'peregrinacion, reliquias y servicios',
  ],

  townAuthorities: [
    'un alcalde agotado',
    'una guardia demasiado visible',
    'un consejo local dividido',
    'un templo con mas poder del debido',
    'un noble distante pero temido',
    'un gremio que decide mas de lo que admite',
  ],

  townArchitecture: [
    'madera vieja reforzada con remiendos de piedra',
    'muros encalados y tejados oscuros muy apretados',
    'casas torcidas levantadas sobre ruinas anteriores',
    'piedra humeda, soportales estrechos y ventanas pequenas',
    'edificios recios pensados mas para aguantar que para gustar',
    'mezcla improvisada de estilos traidos por viajeros y comercio',
  ],

  townTensions: [
    'nadie confia del todo en sus vecinos',
    'la guardia y la poblacion civil miden cada palabra',
    'los forasteros son utiles, pero nunca bienvenidos',
    'un conflicto viejo esta a punto de reabrirse',
    'la prosperidad reciente tiene demasiados enemigos',
    'todo parece tranquilo hasta que cae la noche',
  ],

  townConditions: [
    'un pulso cotidiano agotado pero funcional',
    'una calma rara, como si faltara algo importante',
    'una actividad constante que esconde nervios',
    'un ambiente receloso interrumpido por rumores',
    'una rutina alterada por una crisis aun sin nombre',
    'una normalidad teatral que nadie se termina de creer',
  ],

  townOddities: [
    'muchas puertas muestran la misma marca de tiza',
    'los vecinos evitan mirar hacia una misma calle al anochecer',
    'hay demasiadas campanas para un lugar tan pequeno',
    'las ventanas se cierran todas a la misma hora exacta',
    'un olor persistente aparece y desaparece sin causa clara',
    'todo el mundo conoce una cancion local que nadie quiere explicar',
  ],

  townSuperstitions: [
    'no silbar despues del ultimo toque de campana',
    'dejar sal en el umbral cuando falta alguien',
    'no pronunciar ciertos nombres cerca del pozo',
    'encender una vela extra si sueñas con agua negra',
    'no abrir la puerta a la primera llamada nocturna',
    'tocar hierro viejo antes de cruzar el barrio del templo',
  ],

  worldFrames: [
    'una frontera tras una guerra reciente',
    'los restos útiles de un imperio colapsado',
    'una region prospera sostenida por un recurso escaso',
    'una tierra sagrada disputada por varias fes',
    'una ruta comercial rota o desviada',
    'un territorio aparentemente normal asentado sobre ruinas antiguas',
    'una zona inestable desde la desaparicion de una autoridad clave',
  ],

  regionalPressures: [
    'una ola de refugiados que trae hambre, mano de obra y viejos enemigos',
    'una enfermedad de origen incierto que nadie se atreve a nombrar en voz alta',
    'impuestos abusivos y reclutamientos forzosos para una guerra lejana',
    'monstruos desplazados de su habitat por excavaciones o incendios',
    'caravanas que llegan tarde, vacias o no llegan en absoluto',
    'la visita prolongada de un inquisidor, embajador o noble molesto',
    'senales celestes, presagios religiosos y clima anomalo',
  ],

  settlementIdentities: [
    'un pueblo con un secreto oscuro demasiado compartido para seguir siendo secreto',
    'una villa de fachada amable y costumbres inquietantes',
    'un boomtown reciente levantado por mina, santuario o ruta comercial',
    'un asentamiento ocupado por una fuerza externa que finge ser invitada',
    'un enclave fronterizo que vive de escoltas, contrabando y nervios',
    'un lugar definido por una reliquia, festival o gremio demasiado influyente',
    'una comunidad que convive con una amenaza debajo de sus propias calles',
  ],

  powerStructures: [
    'un alcalde debil con una guardia demasiado fuerte',
    'un templo dominante y un noble puramente decorativo',
    'dos gremios poderosos en guerra fria constante',
    'un consejo de familias rivales incapaz de parecer unido',
    'una milicia popular enfrentada a la autoridad legal',
    'una red criminal con fachada legitima y mucha clientela',
    'una sociedad discreta incrustada en las instituciones locales',
  ],

  localLaws: [
    'esta prohibido abrir negocio nuevo sin permiso de tres firmas concretas',
    'ningun extranjero puede permanecer armado dentro de la plaza principal',
    'las campanas del anochecer obligan a cerrar puertas y tabernas',
    'los entierros deben hacerse antes de la siguiente puesta de sol',
    'esta mal visto, y casi penado, preguntar por ciertas ruinas',
    'nadie puede comprar sal en grandes cantidades sin dar explicaciones',
    'los nombres de ciertos muertos no deben pronunciarse en publico',
  ],

  hiddenConflicts: [
    'alguien intenta despertar algo antiguo bajo el asentamiento',
    'una faccion local protege a un monstruo porque les resulta util',
    'la reliquia principal es falsa, robada o peligrosa',
    'la autoridad visible es un titere y todo el mundo importante lo sospecha',
    'los desaparecidos no estan muertos, pero casi nadie preferiria saber la verdad',
    'una vieja promesa mantiene la paz solo porque aun se paga un precio secreto',
    'el enemigo real ya esta infiltrado entre guardia, clero o comercio',
  ],

  districtTypes: [
    'el barrio del mercado',
    'los muelles',
    'la colina vieja',
    'el barrio del templo',
    'las huertas exteriores',
    'la calle de los artesanos',
    'la plaza del ganado',
    'las casas altas',
    'el anillo de murallas',
    'las casuchas junto al arroyo',
  ],

  districtTraits: [
    'siempre huele a brea, cebolla y noticias peligrosas',
    'sus vecinos se conocen por nombre y por deuda',
    'las puertas tienen dos cerraduras y las ventanas ninguna',
    'las paredes conservan marcas de una revuelta antigua',
    'hay mas ojos tras las cortinas que clientes en la calle',
    'nadie camina deprisa excepto quien tiene muy buenas razones',
    'todo parece provisional salvo los resentimientos',
    'cada esquina tiene un uso distinto de dia y de noche',
  ],

  pointOfInterestTypes: [
    'una capilla menor con un rito extraño',
    'un molino con acceso oculto al subsuelo',
    'unos baños publicos donde se oye demasiado',
    'un puente viejo con peaje no oficial',
    'un cementerio activo por razones no obvias',
    'una torre semiderruida integrada en viviendas recientes',
    'un mercado negro disfrazado de feria legal',
    'una cantera, pozo o almazara con actividad sospechosa',
  ],

  factionTypes: [
    'gremio comercial',
    'cofradia religiosa',
    'sociedad discreta',
    'milicia ciudadana',
    'banda criminal refinada',
    'casa noble menor',
    'orden de estudiosos',
    'compañia mercenaria',
  ],

  factionGoals: [
    'controlar una ruta, recurso o reliquia',
    'capturar un cargo publico sin parecer ambicioso',
    'silenciar un secreto historico muy comprometedor',
    'reclutar discretamente antes de un conflicto mayor',
    'provocar un incidente que justifique intervenir',
    'impedir una excavacion o la apertura de un lugar sellado',
    'monopolizar seguridad, cura o provisiones basicas',
  ],

  factionMethods: [
    'sobornos calculados y favores imposibles de devolver',
    'chantaje basado en secretos domesticos',
    'violencia selectiva y bien ejemplificada',
    'rumores sembrados como si fueran sentido comun',
    'caridad interesada y muy visible',
    'agentes incrustados en oficios humildes',
    'contratos redactados para atrapar al desesperado',
  ],

  factionResources: [
    'un almacen oculto de bienes incautados',
    'escribas capaces de falsear registros',
    'guardias fuera de servicio con hambre de dinero',
    'acceso a tuneles o almacenes olvidados',
    'niños mensajeros que nadie toma en serio',
    'dinero extranjero de origen comprometedor',
    'un informador dentro de la casa adecuada',
  ],

  weather: [
    'una llovizna fria que parece no terminar nunca',
    'niebla espesa que vuelve cercanas las campanas y lejanos los gritos',
    'viento seco cargado de polvo y hojas muertas',
    'bochorno pesado, casi de tormenta, aunque no cae una gota',
    'copos lentos y silenciosos que amortiguan hasta los pasos de la guardia',
    'nubes bajas que ocultan incluso las torres mas altas',
  ],

  omens: [
    'tres cuervos posados mirando todos hacia la misma casa',
    'campanas que suenan sin mano visible',
    'perros que rehusan cruzar cierto cruce al caer la tarde',
    'huellas mojadas donde el suelo sigue seco',
    'un zumbido grave que desaparece cuando alguien intenta señalarlo',
    'un enjambre de polillas golpeando solo una puerta concreta',
  ],

  npcGoals: [
    'abandonar este lugar antes de que ocurra algo peor',
    'recuperar algo robado sin levantar sospechas',
    'mantener con vida a su familia una semana mas',
    'vengarse de alguien con mas poder del prudente',
    'limpiar su nombre sin exponer su mayor pecado',
    'descubrir que hay tras una puerta, tumba o libro sellado',
  ],

  npcFears: [
    'ser reconocido por alguien de su pasado',
    'que registren su casa o negocio',
    'quedarse a solas despues del anochecer',
    'la proxima luna nueva',
    'que alguien interprete bien sus mentiras',
    'deber favores a la gente equivocada',
  ],

  tavernClientele: [
    'barqueros agotados, tratantes con barro en las botas y curiosos sin oficio claro',
    'campesinos desconfiados, dos guardias fuera de turno y una mesa que nunca pierde a los dados',
    'mercaderes de paso, escribanos que oyen demasiado y un par de espaldas muy anchas',
    'viajeros que fingen cansancio y vecinos que fingen no reconocerlos',
    'oficiales menores, tahures educados y buscavidas con hambre de oportunidad',
  ],

  tavernFunctions: [
    'punto neutral entre facciones que se odian pero se necesitan',
    'bolsa de trabajo improvisada para aventureros y mercenarios',
    'nido de rumores, apuestas y negocios dudosos',
    'tapadera de contrabando, espionaje o culto',
    'centro social del pueblo durante cualquier crisis',
    'lugar supuestamente seguro que deja de serlo con frecuencia',
  ],

  tavernHooks: [
    'un deudor se esconde en una de las habitaciones y no piensa salir',
    'esta noche hay una reunion clandestina en el sotano',
    'un cliente habitual ha desaparecido y todos mienten al respecto',
    'un barril o despensa presenta una propiedad anomala que conviene explicar rapido',
    'un juego o competicion local esta a punto de convertirse en violencia real',
    'alguien ha alquilado una habitacion con otro nombre y demasiada prisa',
  ],

  mysteryFrames: [
    'una desaparicion ligada a un calendario o ritual',
    'un asesinato con culpable aparente demasiado obvio',
    'un monstruo visible cuya causa real es completamente humana',
    'un robo sacrilego que nadie quiere denunciar en publico',
    'una enfermedad, locura o transformacion con vector oculto',
    'una conspiracion comercial disfrazada de maldicion',
  ],

  clueTypes: [
    'una evidencia fisica fuera de lugar',
    'un testimonio contradictorio pero sincero',
    'un registro religioso, comercial o judicial manipulado',
    'un simbolo, cancion o supersticion que encubre un hecho',
    'un rastro logistico de comida, madera, telas o monedas',
    'un comportamiento extraño en animales o niños',
  ],

  encounterObjectives: [
    'proteger a alguien mientras escapa',
    'convencer a dos bandos de que no se maten todavia',
    'impedir un ritual antes de que termine',
    'cruzar terreno hostil con informacion que no puede perderse',
    'rescatar a un cautivo sin alertar a media region',
    'exponer a un impostor antes de que cambie de rostro o de puesto',
  ],

  encounterComplications: [
    'el terreno es estrecho, vertical o se viene abajo',
    'hay civiles en medio y nadie quiere admitirlo',
    'fuego, humo o agua convierten todo en un reloj',
    'el enemigo quiere algo distinto a matar',
    'aparece un tercer actor en el peor momento',
    'la recompensa moral es peor que el peligro fisico',
  ],
})

// ── GENERADORES ───────────────────────────────────────────────

const EEEG = {

  // Genera un pueblo/aldea completo
  generateTown () {
    const prefix = r(data.townNames.prefix)
    const suffix = r(data.townNames.suffix)
    const name = `${prefix.charAt(0).toUpperCase() + prefix.slice(1)}${suffix}`
    const type = r(data.townTypes)
    const populationBase = {
      aldea: dice(2, 70) + 40,
      pueblo: dice(3, 90) + 120,
      villa: dice(4, 120) + 260,
      ciudad: dice(6, 220) + 1200,
      asentamiento: dice(3, 80) + 80,
      enclave: dice(3, 100) + 90,
      bastion: dice(3, 110) + 140,
      fortaleza: dice(3, 120) + 180,
      puerto: dice(4, 140) + 300,
      mercado: dice(4, 130) + 220,
    }
    const population = populationBase[type] || (dice(3, 200) + 50)
    const prosperity = r(data.townProsperity)
    const industry = r(data.townIndustries)
    const authority = r(data.townAuthorities)
    const event = r(data.townEvents)
    const landmark = r(data.townLandmarks)
    const architecture = r(data.townArchitecture)
    const tension = r(data.townTensions)
    const condition = r(data.townConditions)
    const oddity = r(data.townOddities)
    const superstition = r(data.townSuperstitions)
    const worldFrame = r(data.worldFrames)
    const regionalPressure = r(data.regionalPressures)
    const identity = r(data.settlementIdentities)
    const powerStructure = r(data.powerStructures)
    const localLawOrTaboo = r(data.localLaws)
    const hiddenConflict = r(data.hiddenConflicts)
    const district = { name: r(data.districtTypes), trait: r(data.districtTraits) }
    const pointOfInterest = r(data.pointOfInterestTypes)
    const weather = r(data.weather)
    const omen = r(data.omens)

    return {
      name,
      type,
      population,
      prosperity,
      industry,
      authority,
      architecture,
      event,
      tension,
      condition,
      oddity,
      superstition,
      worldFrame,
      regionalPressure,
      identity,
      powerStructure,
      localLawOrTaboo,
      hiddenConflict,
      district,
      pointOfInterest,
      weather,
      omen,
      landmark,
      summary: `${name} es un ${type} ${prosperity} de unos ${population} habitantes. Vive de ${industry}, responde a ${authority} y se reconoce por ${landmark}. Su arquitectura muestra ${architecture}, mientras ${event}. Bajo la superficie, ${hiddenConflict}.`
    }
  },

  generateFaction () {
    const type = r(data.factionTypes)
    const goal = r(data.factionGoals)
    const method = r(data.factionMethods)
    const resource = r(data.factionResources)
    return {
      type,
      goal,
      method,
      resource,
      summary: `${type.charAt(0).toUpperCase() + type.slice(1)} centrado en ${goal}. Suele actuar mediante ${method} y cuenta con ${resource}.`
    }
  },

  generateMystery () {
    const frame = r(data.mysteryFrames)
    const clues = pickMany(data.clueTypes, 3)
    return {
      frame,
      clues,
      summary: `${frame}. Pistas iniciales: ${clues.join(', ')}.`
    }
  },

  // Genera un NPC secundario completo
  generateNPC (profession = null) {
    const professions = ['herrero','comerciante','granjero','guardia','tabernero','ladrón','mendigo','viajero','mercader','monje','pescador','cazador','escriba','curandero','mensajero']
    const physicalTrait = r(data.npcPhysicalTraits)
    const mood = r(data.npcMoods)
    const pocket = r(data.npcPockets)
    const secret = r(data.npcSecrets)
    const idle = r(data.npcIdleActions)
    const goal = r(data.npcGoals)
    const fear = r(data.npcFears)
    return {
      mood,
      physicalTrait,
      pocket,
      secret,
      idle,
      goal,
      fear,
      profession: profession || r(professions),
      summary: `Tiene ${physicalTrait} y parece estar ${mood}. Cuando crees que no le miras, está ${idle}. Quiere ${goal}, pero teme ${fear}.`
    }
  },

  // Genera una taberna
  generateTavern () {
    const wealthTier = r(['cheap', 'average', 'wealthy'])
    const wealthLabel = { cheap: 'humilde', average: 'corriente', wealthy: 'próspera' }
    const name = `${r(data.tavernNamePrefixes)} ${r(data.tavernNameNouns)}`
    const brew = r(data.tavernSpecialBrews)
    const feature = r(data.tavernFeatures[wealthTier])
    const rumor = r(data.tavernRumors)
    const event = r(data.tavernEvents)
    const clientele = r(data.tavernClientele)
    const functionInTown = r(data.tavernFunctions)
    const hook = r(data.tavernHooks)
    return {
      name,
      wealth: wealthLabel[wealthTier],
      feature,
      rumor,
      event,
      clientele,
      functionInTown,
      hook,
      specialBrew: brew,
      summary: `La taberna se llama "${name}", un local ${wealthLabel[wealthTier]}. Lo primero que notas al entrar es que ${feature}. Suele funcionar como ${functionInTown}, con clientela formada por ${clientele}. La bebida especial de la casa es "${brew.name}": ${brew.desc} Se rumorea que ${rumor}, y ahora mismo ${hook}.`
    }
  },

  // Genera un edificio de un tipo concreto
  generateBuilding (type = null) {
    const types = Object.keys(data.buildings)
    const t = type && data.buildings[type] ? type : r(types)
    const b = data.buildings[t]
    const typeNames = { smithy: 'herrería', alchemist: 'tienda de alquimia', generalStore: 'tienda general', temple: 'templo' }
    return {
      type: t,
      typeName: typeNames[t] || t,
      notableFeature: r(b.notableFeature),
      specialty: r(b.specialty),
      summary: `La ${typeNames[t] || t} destaca porque ${r(b.notableFeature)}. Es conocida por ${r(b.specialty)}.`
    }
  },

  // Genera un gancho de misión
  generatePlotHook () {
    const hook = r(data.plotHooks)
    const objective = r(data.encounterObjectives)
    const complication = r(data.encounterComplications)
    return {
      ...hook,
      objective,
      complication,
      summary: `**${hook.summary}**: ${hook.desc} Objetivo probable: ${objective}. Complicacion inicial: ${complication}.`
    }
  },

  // Genera un encuentro según bioma
  generateEncounter (biome = null) {
    const biomes = Object.keys(data.encounters)
    const b = biome && data.encounters[biome] ? biome : r(biomes)
    const objective = r(data.encounterObjectives)
    const complication = r(data.encounterComplications)
    return {
      biome: b,
      description: r(data.encounters[b]),
      objective,
      complication,
      summary: `Encuentro en ${b}: ${r(data.encounters[b])}. Objetivo dramático: ${objective}. Complicacion: ${complication}.`
    }
  },

  // Genera un objeto curioso
  generateCuriosity () {
    return r(data.curiosities)
  },

  // Genera un rumor
  generateRumor () {
    return r(data.rumors)
  },

  // Genera un evento de taberna
  generateTavernEvent () {
    return r(data.tavernEvents)
  },

  // Genera un contexto completo de localización (pueblo + taberna + edificio)
  generateLocation () {
    const town = this.generateTown()
    const tavern = this.generateTavern()
    const shop = this.generateBuilding()
    const faction = this.generateFaction()
    const mystery = this.generateMystery()
    return {
      town,
      tavern,
      shop,
      faction,
      mystery,
      summary: `
📍 **${town.name}** — ${town.type} de unos ${town.population} habitantes.
🏛️ Landmark: ${town.landmark}
📢 Evento actual: ${town.event}
⚖️ Poder local: ${town.powerStructure}
⚠️ Tensión actual: ${town.tension}
🕯️ Tabú local: ${town.localLawOrTaboo}
🌦️ Clima del momento: ${town.weather}
🔮 Presagio: ${town.omen}
🏘️ Distrito notable: ${town.district.name}, donde ${town.district.trait}
🗝️ Punto de interés: ${town.pointOfInterest}

🍺 **Taberna: ${tavern.name}** (${tavern.wealth})
Lo primero que notas: ${tavern.feature}
Rumor local: ${tavern.rumor}
Bebida especial: "${tavern.specialBrew.name}" — ${tavern.specialBrew.desc}
Función social: ${tavern.functionInTown}
Gancho de taberna: ${tavern.hook}

🏪 **${shop.typeName.charAt(0).toUpperCase() + shop.typeName.slice(1)}**
Característica: ${shop.notableFeature}
Especialidad: ${shop.specialty}

🜂 **Facción en juego**
${faction.summary}

🧩 **Misterio latente**
${mystery.summary}
      `.trim()
    }
  },

  // Genera una sesión completa de inicio de aventura
  generateAdventureStart () {
    const location = this.generateLocation()
    const hook = this.generatePlotHook()
    const npc = this.generateNPC()
    const rumor = this.generateRumor()
    const encounter = this.generateEncounter()
    return {
      location,
      hook,
      npc,
      rumor,
      encounter,
      summary: `
${location.summary}

🎭 **NPC notable**: ${npc.summary} Lleva en los bolsillos: ${npc.pocket}. Su secreto: ${npc.secret}.

📋 **Gancho de aventura**: ${hook.summary}

⚔️ **Encuentro posible**: ${encounter.description}

💬 **Rumor que circula**: ${rumor}
      `.trim()
    }
  }
}

module.exports = EEEG
