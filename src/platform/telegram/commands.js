const GROUP_TELEGRAM_COMMANDS = [
  { command: 'nueva', description: 'Inicia o reinicia una partida' },
  { command: 'unirse', description: 'Une un jugador a la partida actual' },
  { command: 'continuar', description: 'Recupera la ultima aventura guardada' },
  { command: 'seguir', description: 'Fuerza a la IA a continuar una escena' },
  { command: 'donar', description: 'Muestra formas de apoyar el proyecto' },
  { command: 'resetvotacion', description: 'Limpia una votacion atascada' },
  { command: 'estado', description: 'Muestra el estado del grupo' },
  { command: 'xp', description: 'Consulta la experiencia del grupo' },
  { command: 'habilidades', description: 'Lista las habilidades desbloqueadas' },
  { command: 'memoria', description: 'Resume decisiones, lugares y NPCs' },
  { command: 'cronica', description: 'Exporta la cronica de la aventura' },
  { command: 'ayuda', description: 'Muestra la ayuda disponible' },
]

const PRIVATE_TELEGRAM_COMMANDS = [
  { command: 'nueva', description: 'Inicia o reinicia una partida' },
  { command: 'unirse', description: 'Crea el siguiente personaje de la partida' },
  { command: 'continuar', description: 'Recupera tu ultima aventura guardada' },
  { command: 'seguir', description: 'Fuerza a la IA a continuar una escena' },
  { command: 'donar', description: 'Muestra formas de apoyar el proyecto' },
  { command: 'resetvotacion', description: 'Limpia una votacion atascada' },
  { command: 'estado', description: 'Muestra el estado de los personajes' },
  { command: 'xp', description: 'Consulta la experiencia del grupo' },
  { command: 'habilidades', description: 'Lista las habilidades desbloqueadas' },
  { command: 'memoria', description: 'Resume decisiones, lugares y NPCs' },
  { command: 'cronica', description: 'Exporta la cronica de la aventura' },
  { command: 'ayuda', description: 'Muestra la ayuda disponible' },
]

module.exports = {
  GROUP_TELEGRAM_COMMANDS,
  PRIVATE_TELEGRAM_COMMANDS,
}
