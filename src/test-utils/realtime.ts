/**
 * A fake Supabase Realtime client for tests. Test files mock `@/auth/supabase` with
 * `{ __esModule: true, supabase: null }` (`__esModule` lets `replaceProperty` reach the code
 * under test) and plug this client in where a test needs Realtime. Every channel the code
 * joins is recorded, so the test can report its join statuses and deliver broadcasts to it.
 */
import * as auth from "@/auth/supabase";

export type BroadcastHandler = (message: { payload: unknown }) => void;
export type StatusCallback = (status: string, error?: Error) => void;

export interface FakeChannel {
  /** The topic the code asked for, without Realtime's `realtime:` prefix. */
  readonly topic: string;
  readonly options: unknown;
  on: jest.Mock<FakeChannel, [string, { event?: string }, BroadcastHandler]>;
  subscribe: jest.Mock<FakeChannel, [StatusCallback?]>;
  /** Delivers `payload` to the handlers the code registered for broadcast `event`. */
  broadcast(event: string, payload: unknown): void;
  /** Calls the subscribe callback, as Realtime does on a join, a failure or a rejoin. */
  report(status: string, error?: Error): void;
}

export interface RealtimeFake {
  /** The client installed as `supabase`. */
  fake: {
    channel: jest.Mock<FakeChannel, [string, unknown?]>;
    removeChannel: jest.Mock<Promise<string>, [FakeChannel]>;
  };
  /** Every channel created, in order. */
  channels: FakeChannel[];
  /** Puts the previous `supabase` back. */
  restore(): void;
}

function createChannel(
  topic: string,
  options: unknown,
  onSubscribe: (channel: FakeChannel) => void,
): FakeChannel {
  const handlers: { event?: string; handler: BroadcastHandler }[] = [];
  let status: StatusCallback | undefined;
  const channel: FakeChannel = {
    topic,
    options,
    on: jest.fn((_type: string, filter: { event?: string }, handler: BroadcastHandler) => {
      handlers.push({ event: filter.event, handler });
      return channel;
    }),
    subscribe: jest.fn((callback?: StatusCallback) => {
      status = callback;
      onSubscribe(channel);
      return channel;
    }),
    broadcast: (event, payload) => {
      for (const entry of handlers) if (entry.event === event) entry.handler({ payload });
    },
    report: (next, error) => status?.(next, error),
  };
  return channel;
}

/**
 * Installs the fake client until `restore`. `onSubscribe` runs as soon as the code subscribes
 * to a channel (to report a status or broadcast at once); tests can also drive any recorded
 * channel later.
 */
export function plugRealtime(onSubscribe: (channel: FakeChannel) => void = () => {}): RealtimeFake {
  const channels: FakeChannel[] = [];
  const fake = {
    channel: jest.fn((topic: string, options?: unknown) => {
      const channel = createChannel(topic, options, onSubscribe);
      channels.push(channel);
      return channel;
    }),
    removeChannel: jest.fn(async (_channel: FakeChannel) => "ok"),
  };
  const { restore } = jest.replaceProperty(auth, "supabase", fake as never);
  return { fake, channels, restore };
}
