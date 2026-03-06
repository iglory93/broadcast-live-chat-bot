class CommandRegistry {

  constructor() {
    this.commands = [];
  }

  register(pattern, handler) {

    this.commands.push({
      pattern,
      handler
    });

    console.log("command registered:", pattern);
  }

  getCommands() {
    return this.commands;
  }

}

module.exports = new CommandRegistry();