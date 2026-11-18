/**
 * The mail database runs here, on its own thread, so the app window never waits for the disk: saving a large sync or a slow drive
 * cannot make Pivot Mail stutter or freeze. The main process (main.ts) checks every request and passes it on; calls are answered
 * one at a time, in the order they were made.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { MailStore } from './store'

const store = new MailStore((workerData as { file: string }).file)
type Req = { id: number; op: string; a?: unknown; b?: unknown }

parentPort?.on('message', ({ id, op, a, b }: Req) => {
  try {
    let r: unknown = null
    switch (op) {
      case 'load':
        r = store.load(a as string)
        break
      case 'save':
        store.save(a as Parameters<MailStore['save']>[0])
        break
      case 'remove':
        store.remove(a as string[])
        break
      case 'thread':
        r = store.thread(a as string, b as string)
        break
      case 'search':
        r = store.search(a as string[], b as string)
        break
      case 'getMeta':
        r = store.getMeta(a as string)
        break
      case 'setMeta':
        store.setMeta(a as string, b as string)
        break
      case 'clearAccount':
        store.clearAccount(a as string)
        break
      case 'clearAll':
        store.clearAll()
        break
      case 'close':
        store.close()
        break
    }
    parentPort?.postMessage({ id, ok: true, r })
  } catch (e) {
    parentPort?.postMessage({ id, ok: false, error: String(e) })
  }
})
parentPort?.postMessage({ id: 0, ok: true, r: 'ready' })
