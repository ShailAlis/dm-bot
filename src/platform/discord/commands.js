const { SlashCommandBuilder } = require('discord.js')

function buildDiscordCommands() {
  return [
    new SlashCommandBuilder()
      .setName('nueva')
      .setDescription('Inicia una nueva partida; crea un hilo si hace falta')
      .addIntegerOption((option) => (
        option
          .setName('jugadores')
          .setDescription('Numero de jugadores para esta partida')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(4)
      )),
    new SlashCommandBuilder()
      .setName('estado')
      .setDescription('Muestra el estado actual del grupo'),
    new SlashCommandBuilder()
      .setName('xp')
      .setDescription('Muestra la experiencia del grupo'),
    new SlashCommandBuilder()
      .setName('habilidades')
      .setDescription('Muestra las habilidades desbloqueadas'),
    new SlashCommandBuilder()
      .setName('memoria')
      .setDescription('Resume lugares, NPCs y decisiones'),
    new SlashCommandBuilder()
      .setName('cronica')
      .setDescription('Exporta la cronica en un archivo .txt'),
    new SlashCommandBuilder()
      .setName('unirse')
      .setDescription('Crea tu personaje y te une a la partida actual'),
    new SlashCommandBuilder()
      .setName('actuar')
      .setDescription('Describe lo que hace tu personaje en la escena actual')
      .addStringOption((option) => (
        option
          .setName('texto')
          .setDescription('Accion, dialogo o intencion de tu personaje')
          .setRequired(true)
          .setMaxLength(1000)
      )),
    new SlashCommandBuilder()
      .setName('continuar')
      .setDescription('Recupera la aventura guardada en este canal o hilo'),
    new SlashCommandBuilder()
      .setName('seguir')
      .setDescription('Fuerza a la IA a continuar la escena actual'),
    new SlashCommandBuilder()
      .setName('ayuda')
      .setDescription('Muestra el estado actual de la integracion de Discord'),
  ]
}

module.exports = {
  buildDiscordCommands,
}
