// class ChatQueue {

//   constructor() {
//     this.queue = [];
//   }

//   push(chat) {
//     this.queue.push(chat);
//   }

//   pop() {
//     return this.queue.shift();
//   }

//   size() {
//     return this.queue.length;
//   }

// }

// module.exports = new ChatQueue();
class ChatQueue {
  constructor() {
    this.queue = [];
    this.head = 0;
  }

  push(chat) {
    this.queue.push(chat);
  }

  pop() {
    if (this.head >= this.queue.length) return null;

    const value = this.queue[this.head++];
    
    if (this.head > 1000) {
      this.queue = this.queue.slice(this.head);
      this.head = 0;
    }

    return value;
  }

  size() {
    return this.queue.length - this.head;
  }

  clear() {
    this.queue = [];
    this.head = 0;
  }
}

module.exports = new ChatQueue();