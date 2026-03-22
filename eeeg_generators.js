// ============================================================
//  eeeg.js — Generadores de mundo inspirados en EEEG
//  Importar en index.js con: const EEEG = require('./eeeg')
// ============================================================

const r = arr => arr[Math.floor(Math.random() * arr.length)]
const dice = (n, sides) => Array.from({length: n}, () => Math.floor(Math.random() * sides) + 1).reduce((a, b) => a + b, 0)

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

// ── GENERADORES ───────────────────────────────────────────────

const EEEG = {

  // Genera un pueblo/aldea completo
  generateTown () {
    const prefix = r(data.townNames.prefix)
    const suffix = r(data.townNames.suffix)
    const name = `${prefix.charAt(0).toUpperCase() + prefix.slice(1)}${suffix}`
    return {
      name,
      type: r(data.townTypes),
      population: dice(3, 200) + 50,
      event: r(data.townEvents),
      landmark: r(data.townLandmarks),
      summary: `${name} es un ${r(data.townTypes)} de unos ${dice(3,200)+50} habitantes. Su punto de referencia más conocido es ${r(data.townLandmarks)}. Actualmente ${r(data.townEvents)}.`
    }
  },

  // Genera un NPC secundario completo
  generateNPC (profession = null) {
    const professions = ['herrero','comerciante','granjero','guardia','tabernero','ladrón','mendigo','viajero','mercader','monje','pescador','cazador','escriba','curandero','mensajero']
    return {
      mood: r(data.npcMoods),
      physicalTrait: r(data.npcPhysicalTraits),
      pocket: r(data.npcPockets),
      secret: r(data.npcSecrets),
      idle: r(data.npcIdleActions),
      profession: profession || r(professions),
      summary: `Tiene ${r(data.npcPhysicalTraits)} y parece estar ${r(data.npcMoods)}. Cuando crees que no le miras, ${r(data.npcIdleActions)}.`
    }
  },

  // Genera una taberna
  generateTavern () {
    const wealthTier = r(['cheap', 'average', 'wealthy'])
    const wealthLabel = { cheap: 'humilde', average: 'corriente', wealthy: 'próspera' }
    const name = `${r(data.tavernNamePrefixes)} ${r(data.tavernNameNouns)}`
    const brew = r(data.tavernSpecialBrews)
    return {
      name,
      wealth: wealthLabel[wealthTier],
      feature: r(data.tavernFeatures[wealthTier]),
      rumor: r(data.tavernRumors),
      event: r(data.tavernEvents),
      specialBrew: brew,
      summary: `La taberna se llama "${name}", un local ${wealthLabel[wealthTier]}. Lo primero que notas al entrar es que ${r(data.tavernFeatures[wealthTier])}. La bebida especial de la casa es "${brew.name}": ${brew.desc} Se rumorea que ${r(data.tavernRumors)}.`
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
    return {
      ...hook,
      summary: `**${hook.summary}**: ${hook.desc}`
    }
  },

  // Genera un encuentro según bioma
  generateEncounter (biome = null) {
    const biomes = Object.keys(data.encounters)
    const b = biome && data.encounters[biome] ? biome : r(biomes)
    return {
      biome: b,
      description: r(data.encounters[b])
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
    return {
      town,
      tavern,
      shop,
      summary: `
📍 **${town.name}** — ${town.type} de unos ${town.population} habitantes.
🏛️ Landmark: ${town.landmark}
📢 Evento actual: ${town.event}

🍺 **Taberna: ${tavern.name}** (${tavern.wealth})
Lo primero que notas: ${tavern.feature}
Rumor local: ${tavern.rumor}
Bebida especial: "${tavern.specialBrew.name}" — ${tavern.specialBrew.desc}

🏪 **${shop.typeName.charAt(0).toUpperCase() + shop.typeName.slice(1)}**
Característica: ${shop.notableFeature}
Especialidad: ${shop.specialty}
      `.trim()
    }
  },

  // Genera una sesión completa de inicio de aventura
  generateAdventureStart () {
    const location = this.generateLocation()
    const hook = this.generatePlotHook()
    const npc = this.generateNPC()
    const rumor = this.generateRumor()
    return {
      location,
      hook,
      npc,
      rumor,
      summary: `
${location.summary}

🎭 **NPC notable**: ${npc.summary} Lleva en los bolsillos: ${npc.pocket}. Su secreto: ${npc.secret}.

📋 **Gancho de aventura**: ${hook.summary}

💬 **Rumor que circula**: ${rumor}
      `.trim()
    }
  }
}

module.exports = EEEG
