export const state = {
  actorId: '',
  actorName: '',
  roomId: '',
  room: null,
  activeVote: null,
  chronicle: [],
  revision: 0,
  pollTimer: null,
  setupOptions: {
    races: [],
    classes: [],
  },
  donations: {
    enabled: false,
    message: '',
    providers: [],
  },
}

export const el = {}
