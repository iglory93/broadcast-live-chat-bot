class ChatQueue {

  constructor() {
    this.queue = [];
  }

  push(chat) {
    this.queue.push(chat);
  }

  pop() {
    return this.queue.shift();
  }

  size() {
    return this.queue.length;
  }

}

module.exports = new ChatQueue();