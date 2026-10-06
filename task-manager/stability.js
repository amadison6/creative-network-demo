(() => {
  const NativeMutationObserver = window.MutationObserver;
  if (!NativeMutationObserver) return;

  const isDecorativeNode = node => {
    if (!node || node.nodeType !== 1) return true;
    const el = node;
    if (el.classList?.contains('microtask-ui')) return true;
    if ([...el.classList || []].some(name => name.startsWith('flow-'))) return true;
    if (el.closest?.('.microtask-ui')) return true;
    if (el.closest?.('[class*="flow-"]')) return true;
    return false;
  };

  class StableMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.timer = null;
      this.pending = [];
      this.native = new NativeMutationObserver((mutations, observer) => {
        const meaningful = mutations.filter(mutation => {
          if (mutation.type === 'attributes') return mutation.attributeName === 'open';
          const nodes = [...mutation.addedNodes, ...mutation.removedNodes].filter(node => node.nodeType === 1);
          if (!nodes.length) return false;
          return nodes.some(node => !isDecorativeNode(node));
        });
        if (!meaningful.length) return;
        this.pending.push(...meaningful);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          const batch = this.pending.splice(0);
          this.callback(batch, observer);
        }, 90);
      });
    }
    observe(target, options) { return this.native.observe(target, options); }
    disconnect() { clearTimeout(this.timer); this.pending.length = 0; return this.native.disconnect(); }
    takeRecords() { return this.native.takeRecords(); }
  }

  window.MutationObserver = StableMutationObserver;
})();
