import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

export function ser<T>(
  deserialize: (json: unknown) => T,
  serialize: (instance: T) => unknown
): Serializer<T> {
  return new Serializer(serialize, deserialize)
}

export function noop() {
  return undefined
}

export function error(message: string): never {
  throw new Error(message)
}

export class Serializer<T> {
  constructor(
    public serialize: <T2 extends T>(instance: T2) => unknown,
    public deserialize: (json: unknown) => T
  ) {}

  onDeserialized(deser: (instance: T) => T | void) {
    return ser(
      (json: unknown) => {
        const des = this.deserialize(json)
        const res = deser(des)
        return res === undefined ? des : res
      },
      (instance: T) => this.serialize(instance)
    )
  }

  // abstract serialize(instance: T): unknown
  // abstract deserialize(json: unknown): T

  get array() {
    return ser(
      (json: unknown) =>
        Array.isArray(json)
          ? json.map(this.deserialize)
          : [this.deserialize(json)],
      (instance: T[]) => instance.map(this.serialize)
    )
  }

  get ornull() {
    return ser(
      (json: unknown) => (json === null ? null : (this.deserialize(json) as T)),
      (instance: T | null) =>
        instance === null ? null : this.serialize(instance)
    )
  }

  get orundefined() {
    return ser(
      (json: unknown) =>
        json === undefined ? undefined : (this.deserialize(json) as T),
      (instance: T | undefined) =>
        instance === undefined ? undefined : this.serialize(instance)
    )
  }

  get nullable() {
    return ser(
      (json: unknown) => (json == null ? null : (this.deserialize(json) as T)),
      (instance: T | null) =>
        instance == null ? null : this.serialize(instance)
    )
  }

  /** null, error if not present */
  get notnull() {
    return ser(
      (json: unknown) =>
        json == null
          ? error("expected non-null value")
          : (this.deserialize(json) as NonNullable<T>),
      (instance: NonNullable<T>) => this.serialize(instance)
    )
  }

  /** Give a value if there was a null or undefined ; will also apply the default value when serializing. */
  default(value: NonNullable<T>) {
    return ser(
      (json: unknown) =>
        json == undefined ? value : (this.deserialize(json) as NonNullable<T>),
      (instance: T) =>
        instance == null ? this.serialize(value) : this.serialize(instance)
    )
  }

  extend<U extends T>(
    type: new () => U,
    props?: // [keyof U, Serializer<U[keyof U]>][]
    { [key in keyof U]?: Serializer<U[key]> }
  ): Serializer<U> {
    const actions = this instanceof ObjectSerializer ? [...this._actions] : []
    const res = new ObjectSerializer<U>(type, actions)
    if (props != null) {
      res.prop(props)
    }
    return res
  }

  get ro() {
    return ser(
      (json) => this.deserialize(json),
      (instance) => {
        return undefined
      }
    )
  }
}

function action<T>(
  deserialize: (json: unknown, instance: T) => void,
  serialize: (instance: T, json: { [name in keyof T]?: unknown }) => void
): ObjectAction<T> {
  return {
    serialize,
    deserialize,
  }
}

/** An ObjectAction is an action run by the ObjectSerializer. */
export interface ObjectAction<T> {
  serialize(instance: T, json: { [name in keyof T]?: unknown }): void
  deserialize(json: unknown, instance: T): void
}

/** A PropAction is an action that serializes a single property of an object. */
export class PropAction<T> implements ObjectAction<T> {
  constructor(
    public prop: keyof T,
    public serializer: Serializer<T[keyof T]>
  ) {}

  serialize(instance: T, json: { [name in keyof T]?: unknown }) {
    const val = (instance as any)[this.prop]
    if (val !== undefined) {
      json[this.prop] = this.serializer.serialize(val)
    }
  }

  deserialize(json: unknown, instance: T) {
    const to_deser = (json as any)?.[this.prop]
    if (to_deser !== undefined) {
      if (to_deser === null) {
        ;(instance as any)[this.prop] = null
      } else {
        const val = this.serializer.deserialize(to_deser)
        if (val !== undefined) {
          ;(instance as any)[this.prop] = val
        }
      }
    }
  }

  /** Do not serialize this property. */
  get ro() {
    return action((json: unknown, instance: T[keyof T]) => {
      ;(instance as any)[this.prop] = this.serializer.deserialize(json)
    }, noop)
  }

  /** Do not deserialize this property, but serialize it. */
  get wo() {
    return action(noop, (instance: T[keyof T], json: unknown) => {
      ;(json as any)[this.prop] = this.serializer.serialize(instance)
    })
  }
}

export class ObjectSerializer<T> extends Serializer<T> {
  constructor(
    public type: (new () => T) | null,
    public _actions: ObjectAction<T>[] = []
  ) {
    super(
      (instance: T) => {
        let result: { [name in keyof T]?: unknown } = {}
        for (let a = this._actions, i = 0; i < a.length; i++) {
          a[i].serialize(instance, result)
        }
        return result
      },
      (json: unknown) => {
        let result: T =
          this.type != null
            ? Object.create(this.type.prototype ?? this.type)
            : {}
        for (let a = this._actions, i = 0; i < a.length; i++) {
          a[i].deserialize(json, result)
        }
        // console.log("deserialize", json, result)
        return result
      }
    )
  }

  private __prop(prop: keyof T, serializer: SerializerDef<T[keyof T]>): this {
    const ser = typeof serializer === "function" ? serializer() : serializer
    const action = new PropAction(prop, ser)
    let prev = this._actions.findIndex(
      (p) => p instanceof PropAction && p.prop === prop
    )
    if (prev >= 0) {
      this._actions[prev] = action
    } else {
      this._actions.push(action)
    }
    return this
  }

  prop(props: { [key in keyof T]?: SerializerDef<T[key]> }) {
    const res = new ObjectSerializer<T>(this.type, this._actions.slice())

    for (let [prp, serializer] of Object.entries(props || {})) {
      res.__prop(prp as keyof T, serializer as SerializerDef<T[keyof T]>)
    }
    return res
  }
}

// export interface Serializer<T> {
//   serialize(instance: T): unknown
//   serialize_array(instance: T[]): unknown[]

//   deserialize(json: unknown): T
//   deserialize_into(json: unknown, instance: T): void
//   deserialize_into_clone(json: unknown, instance: T): T

//   deserialize_array(json: unknown[]): T[]
//   deserialize_into_array(json: unknown[], instance: T[]): void
// }

//////////////////////////////////////////

function _map_maybe_array<T>(json: unknown, f: (json: unknown) => T): T[] {
  return Array.isArray(json) ? json.map(f) : [f(json)]
}

export const bigint = ser(
  (json) => BigInt(json as string | number),
  (json) => json.toString()
)
export const str = ser(
  (json) => json!.toString(),
  (json) => json.toString()
)
export const num = ser(
  (json) => (json != null ? Number(json) : null) as number,
  (json) => (json != null ? Number(json) : null)
)
export const bool = ser(
  (json) => !!json,
  (json) => !!json
)

export const date = ser(
  (json) => dayjs(json as string).startOf("day"),
  (json) => json.format("YYYY-MM-DD")
)

/** This datetime handles dates in the local timezone */
export const timestamptz = ser(
  (json) => dayjs(json as string),
  (dt) => dt.format("YYYY-MM-DDTHH:mm:ss.SSSZ")
)
/** This datetime handles dates in UTC */
export const timestamp = ser(
  (json) => dayjs.utc(json as string),
  (json) => json.toISOString()
)

export const set = <T>(s: Serializer<T>) =>
  ser(
    (json) => new Set<T>(_map_maybe_array(json, s.deserialize)),
    (json) => Array.from(json).map(s.serialize)
  )

export const map = <K, V>(sk: Serializer<K>, sv: Serializer<V>) =>
  ser(
    (json) =>
      new Map<K, V>(
        _map_maybe_array(json, (item) => {
          if (!Array.isArray(item) || item.length !== 2) {
            throw new Error("expected 2-element array")
          }
          const [k, v] = item as [K, V]
          return [sk.deserialize(k), sv.deserialize(v)]
        })
      ),
    (json) =>
      Array.from(json.entries()).map(([k, v]) => [
        sk.serialize(k),
        sv.serialize(v),
      ])
  )

export const map_as_object = <V>(s: Serializer<V>) =>
  ser(
    (json) =>
      new Map<string, V>(
        Object.entries(json as Record<string, V>).map(([k, v]) => [
          k,
          s.deserialize(v),
        ])
      ),
    (json) =>
      Object.fromEntries(
        Array.from(json.entries()).map(([k, v]) => [k, s.serialize(v)])
      )
  )

export const as_is = ser(
  (json) => json,
  (json) => json
)

export function forward<T>(serializer: () => Serializer<T>): Serializer<T> {
  let _ser: Serializer<T> | null = null
  const res = ser(
    (json) => {
      if (_ser == null) {
        _ser = serializer()
      }
      return _ser.deserialize(json)
    },
    (instance: T) => {
      if (_ser == null) {
        _ser = serializer()
      }
      return _ser.serialize(instance)
    }
  )
  return res
}

export function instanceOf<T>(
  type: new () => T,
  props?: { [key in keyof T]?: Serializer<T[key]> }
): Serializer<T> {
  let ser = new ObjectSerializer<T>(type)
  if (props != null) {
    ser = ser.prop(props)
  }

  return ser
}

export function tuple<T extends Serializer<any>[]>(
  ...serializers: T
): Serializer<{
  [K in keyof T]: T[K] extends Serializer<infer U> ? U : never
}> {
  return ser(
    (json) =>
      !Array.isArray(json) || json.length !== serializers.length
        ? error("expected array")
        : (serializers.map((ser, idx) => ser.deserialize(json[idx])) as any),
    (instance: {
      [K in keyof T]: T[K] extends Serializer<infer U> ? U : never
    }) => serializers.map((ser, idx) => ser.serialize(instance[idx]))
  )
}

export function obj<T extends { [name: string | symbol]: SerializerDef<any> }>(
  props: T
): Serializer<{
  [name in keyof T]: T[name] extends SerializerDef<infer U> ? U : T[name]
}> {
  return new ObjectSerializer<any>(null).prop(props) as any
}

export interface Wellknown {
  [name: string]: () => Serializer<any>
}

const _wellknown = new Map<string, () => Serializer<any>>()

export function wellknown<K extends keyof Wellknown>(
  name: K
): ReturnType<Wellknown[K]> {
  return _wellknown.get(name as string)?.() as ReturnType<Wellknown[K]>
}

export function register<S extends Serializer<any>>(
  name: string,
  serializer: () => S
): () => S {
  _wellknown.set(name, serializer)
  return serializer
}

export type UnderlyingType<T> = T extends Serializer<infer U> ? U : T
export type SerializerDef<T> = Serializer<T> | (() => Serializer<T>)
