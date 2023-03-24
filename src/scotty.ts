export const sym_serializer = Symbol("serializer")

export type NoArgClassConstructor<T = any> = {new(): T}

// Any function may be a constructor, for all we know.
declare global {
  interface Function {
    [sym_serializer]?: Serializer
    [sym_on_deserialized]?: Function
  }
}

export type PropSerializerFn<T extends unknown> = (v: T) => unknown
export type PropDeserializerFn<T extends unknown> = (value: any) => T

export type Forward = NoArgClassConstructor | (() => NoArgClassConstructor)

function isClass(obj: Function) {
  const descriptor = Object.getOwnPropertyDescriptor(obj, 'prototype')
  // functions like `Promise.resolve` do have NO `prototype`.
  if (!descriptor) return false
  return !descriptor.writable
}

export function get_type(f: Forward): NoArgClassConstructor {
  const _f = f as Function
  if (!f[sym_serializer]) {
    if (_f.length === 0 && !isClass(f)) return _f()
    throw new Error("the provided forward does not resolve to a serializable type")
  }
  // This is a constructor
  return f as NoArgClassConstructor
}

let _id = 0
export abstract class Action<T extends {} = {}> {
  __id = _id++

  get internal_key(): symbol | string | null { return null }

  /** return the Action instance, not the decorator function, since they wrap them and can cause clone() to fail if the function is `this` */
  get _real_action() {
    if (typeof this === "function") return Object.getPrototypeOf(this)
    return this
  }

  /** Clone shallow copies the Action */
  clone(): this {
    let _this = this._real_action
    const clone = Object.create(
      Object.getPrototypeOf(_this),
      Object.getOwnPropertyDescriptors(_this)
    )
    clone.__id = _id++
    return clone
  }

  /**
   * "transform" the action into a decorator function which is achieved by switching the prototype of said function to the Action object.
  */
  get decorator(): ((target: any, prop?: string) => void) & this {
    const res = (target: any, prop?: string | symbol) => {
      this.apply_decorator(target, prop)
    }
    Object.setPrototypeOf(res, this)
    Object.assign(res, Function.prototype) // keep the Function methods
    return res as any // Yeah, we cheat
  }

  abstract deserialize(instance: T, json: object): void
  abstract serialize(instance: T, json: object): void

  protected apply_decorator(target: any, prop?: string | symbol) {
    // when decorating a class, we get its prototype, so we need to check
    // its constructor
    const ser = Serializer.get(target, true)
    ser.addAction(this)
  }
}

//////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////


export const enum PropActionMode {
  Single = 0,
  Array,
  Map,
  Set,
  Object
}

export class PropAction extends Action {
  prop!: string | symbol
  _mode = PropActionMode.Single
  _prop_ser!: string | symbol
  _prop_des!: string | symbol
  private _map_key_type: PropAction | null = null
  private _null_is_undefined = false

  constructor(
    public _serializer?: PropSerializerFn<any>,
    public _deserializer?: PropDeserializerFn<any>,
  ) {
    super()
  }

  get internal_key() { return this.prop }

  property(key: string | symbol) {
    const clone = this.clone()
    clone.prop = key
    if (!clone._prop_ser) clone._prop_ser = key as string
    if (!clone._prop_des) clone._prop_des = key as string
    return clone
  }

  get map() {
    const cl = this.clone()
    const _old_ser = this._serializer
    const _old_des = this._deserializer
    // Should probably find a way to get an iterator...
    return cl.decorator
  }

  get array() {
    const cl = this.clone() as unknown as PropAction
    const _old_ser = this._serializer
    const _old_des = this._deserializer

    cl._serializer = _old_ser == undefined ? undefined : function ser_array(value) {
      // value should be an array. if it is not, return one
      if (!value[Symbol.iterator] || Array.isArray(value) && value.length === 0) return []
      // otherwise, just return an array
      const res: any[] = []
      for (let v of value[Symbol.iterator]()) {
        res.push(v != null ? _old_ser(v) : v)
      }
      return res
    }

    cl._deserializer = _old_des == undefined ? undefined : function des_array(value) {
      if (!Array.isArray(value) || value.length === 0) return []
      return value.map((val, i) => {
        return val != null ? _old_des(val) : val
      })
    }

    return cl.decorator
  }

  /** Make this action read-only by removing the serializer. */
  get RO() {
    const cl = this.clone()
    cl._serializer = undefined
    return cl.decorator
  }

  /** Make this action write-only by removing the deserializer. */
  get WO() {
    const cl = this.clone()
    cl._deserializer = undefined
    return cl.decorator
  }

  get null_is_undefined() {
    const cl = this.clone()
    cl._null_is_undefined = true
    return cl.decorator
  }

  /** Change the serialized field name */
  to_field(key: string | symbol) {
    const clone = this.clone()
    clone._prop_ser = key
    return clone.decorator
  }

  /** Read from another field name */
  from_field(key: string | symbol) {
    const clone = this.clone()
    clone._prop_des = key
    return clone.decorator
  }

  /** This method is invoked by the proxies */
  addTo(c: NoArgClassConstructor, key: string | symbol) {
    const clone = this.property(key)
    const ser = Serializer.get(c, true)
    ser.addAction(clone)
  }

  /** internal implementation */
  protected apply_decorator(target: any, prop: string | symbol): void {
    this.addTo(target.constructor, prop)
  }

  /** internal. */
  deserialize(instance: object, json: object) {
    if (this._deserializer == null) return

    let oval = (json as any)?.[this._prop_des]
    if (oval === undefined || oval === null && this._null_is_undefined) {
      // do not touch the object if undefined !
    } else if (oval == null) {
      const curval = (instance as any)?.[this.prop]
      // There was no value in the original object
      if (curval == null && !this._null_is_undefined) {
        (instance as any)[this.prop] = null
      }
    } else {
      // There was a value, we're now going to deserialize it
      (instance as any)[this.prop] = this._deserializer(oval)
    }
  }

  serialize(instance: object, json: object) {
    if (this._serializer == null) return

    // FIXME : should check for existence with hasOwnProperty
    let oval = (instance as any)?.[this.prop]
    if (oval === undefined || oval === null && this._null_is_undefined) {
      // Do not write anything
    } else if (oval == null) {
      (json as any)[this._prop_ser ?? this.prop] = null
    } else {
      (json as any)[this._prop_ser ?? this.prop] = this._serializer(oval)
    }
  }

}

/////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

export const sym_on_deserialized = Symbol("on-deserialized")

/**
 *
 */
export class Serializer {

  on_deserialize = false
  constructor(public model: NoArgClassConstructor) {
    if (model.prototype?.[sym_on_deserialized]) {
      this.on_deserialize = true
    }
  }

  static get(ctor: NoArgClassConstructor, create = false): Serializer {

    if (!ctor.hasOwnProperty(sym_serializer)) {
      const res = new Serializer(ctor as {new(): {}})

      // Check if there is already a serializer defined on some parent type and add its actions
      const parent_ser = ctor[sym_serializer]
      if (parent_ser != null) {
        for (let a of parent_ser.actions) {
          res.addAction(a)
        }
      }

      ctor[sym_serializer] = res
      return res
    }

    return ctor[sym_serializer] as Serializer
  }

  /** since actions have internal keys, the Map is used to override actions, mostly used by prop actions to prevent them from registering several actions. */
  action_map = new Map<string | symbol, number>()
  /** the array is maintained separately */
  actions: Action[] = []

  addAction(action: Action) {
    const intkey = action.internal_key
    if (intkey != null) {

      let idx = this.action_map.get(intkey)
      if (idx != null) {
        this.actions[idx] = action
      } else {
        idx = this.actions.length
        this.actions.push(action)
        this.action_map.set(intkey, idx)
      }
    } else {
      this.actions.push(action)
    }
  }

  serialize(instance: object, json: object = {}): unknown {
    for (let i = 0, ac = this.actions, l = ac.length; i < l; i++) {
      ac[i].serialize(instance, json)
    }
    return json
  }

  deserialize(json: object, instance?: object) {
    if (instance == null) instance = new this.model()
    for (let i = 0, ac = this.actions, l = ac.length; i < l; i++) {
      ac[i].deserialize(instance!, json)
    }
    if (this.on_deserialize) {
      (instance as any)[sym_on_deserialized]?.()
    }
    return instance
  }

}


/////////////////////////////////////////////////////////////////////////////////////////////


/**
 * Deserialize a value coming from another source into either a brand new object if a constructor (or class object) is given, or an existing object if it is provided.
 *
 * `json` and `kls` must have the same length if they are both arrays.
 *
 * @param json Json value that comes from an external source
 * @param kls The class on which we have defined a serializer or an instance in which to deserialize the contents of the json object.
 */
export function deserialize<T>(json: unknown[], kls: NoArgClassConstructor<T> | T[]): T[]
export function deserialize<T>(json: unknown, kls: NoArgClassConstructor<T> | T): T
export function deserialize<T>(json: unknown, kls: T | NoArgClassConstructor<T>): T | T[] {
  if (Array.isArray(json)) {
    if (Array.isArray(kls)) {
      // kls are a bunch of instances
      if (kls.length !== json.length) throw new Error(`both arrays need to be the same length`)
      for (let i = 0, l = kls.length; i < l; i++) {
        // For every member of both arrays, get the serializer for the given destination item and deserialize in place.
        const ser = Serializer.get(kls[i].constructor)
        ser.deserialize(json[i], kls[i])
      }
      return kls
    } else {
      if (typeof kls !== "function") throw new Error(`expected either an array of instances or a constructor`)
      const ser = Serializer.get(kls as NoArgClassConstructor<T>)
      const res = new Array(json.length)
      for (let i = 0, l = res.length; i < l; i++) {
        res[i] = ser.deserialize(json[i])
      }
      return res as T[]
    }
  }

  if (json == null || !(json instanceof Object)) {
    throw new Error("input json must be an object")
  }

  if (typeof kls === "function") {
    const ser = Serializer.get(kls as NoArgClassConstructor<T>)
    return ser.deserialize(json) as T
  } else {
    const ser = Serializer.get((kls as any).constructor as NoArgClassConstructor<T>)
    return ser.deserialize(json, kls as object) as T
  }
}


/**
 * Serialize
 * @param instance the object to serialize
 * @returns null if the object was null, a json object or a json array
 */
export function serialize<T extends any[]>(instance: T): unknown[]
export function serialize<T>(instance: T): unknown
export function serialize<T>(instance: T): unknown {
  if (instance == null) return null
  if (Array.isArray(instance)) {
    if (instance.length === 0) return[]
    const res = new Array(instance.length)
    for (let i = 0, l = res.length; i < l; i++) {
      const ser = Serializer.get(instance[0].constructor)
      res[i] = ser.serialize(instance[i])
    }
    return res
  } else {
    const ser = Serializer.get(instance.constructor as NoArgClassConstructor<T>)
    return ser.serialize(instance)
  }
}


////////////////////////////////////////////////////////////////////////////////////////////
////// Basic Actions

function prop_action<F extends {}>(
  ser: PropSerializerFn<F>,
  deser: PropDeserializerFn<F>,
) {
  return new PropAction(ser, deser).decorator
}

/**
 * Transforms from and to strings
 */
export const str = prop_action<string>(function ser_str(s) { return String(s) }, function deser_str(s) { return String(s) })

/**
 * Transforms from and to numbers
 */
export const num = prop_action<number>(function ser_num(n) { return Number(n) }, function deser_num(n) { return Number(n) })

/**
 * Transforms from and to booleans
 */
export const bool = prop_action<boolean>(function ser_bool(b) { return !!b }, function deser_bool(b) { return !!b })

/**
 * Does nothing to the property and forwards it as-is
 */
export const as_is = prop_action<any>(function ser_as_is(j) { return j }, function deser_as_is(j) { return j })


function _pad(v: number) { return v < 10 ? "0" + v : "" + v }

export class DatePropAction extends PropAction {
  constructor() {
    super(undefined, undefined)
    this._serializer = this.date_with_tz_to_json
    this._deserializer = this.date_from_anything
  }

  get to_utc() {
    const cl = this.clone()
    cl._serializer = this.date_to_utc
    return cl.decorator
  }

  get from_seconds() {
    const cl = this.clone()
    cl._deserializer = this.date_from_seconds
    return cl.decorator
  }

  get to_seconds() {
    const cl = this.clone()
    cl._deserializer = this.date_to_seconds
    return cl.decorator
  }

  protected date_to_utc(d: Date) { return d.toJSON() }

  protected date_from_seconds(d: any) {
    const num = Number(d)
    if (!Number.isNaN(num)) return new Date(num * 1000)
    return new Date(d) // other wise just try to cast it
  }

  protected date_to_seconds(d: Date) {
    return Math.round(d.valueOf() / 1000)
  }

  protected date_with_tz_to_json(d: Date) {
    if (d == null) return null
    const tz_offset = d.getTimezoneOffset()
    const tz_sign = tz_offset > 0 ? '-' : '+'
    const tz_hours = _pad(Math.abs(Math.floor(tz_offset / 60)))
    const tz_minutes = _pad(Math.abs(tz_offset) % 60)
    const tz_string = `${tz_sign}${tz_hours}:${tz_minutes}`
    const dt = `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}T${_pad(d.getHours())}:${_pad(d.getMinutes())}:${_pad(d.getSeconds())}`

    return `${dt}${tz_string}`
  }

  protected date_from_anything(d: any) { return new Date(d) }
}

export const date = new DatePropAction().decorator

export function embed(fn: NoArgClassConstructor | (() => NoArgClassConstructor)) {
  let ser!: Serializer
  function des_embed(o: any) {
    return ser.deserialize(o)
  }

  const act = prop_action(
    function ser_embed(o) { return serialize<unknown>(o) },
    function des_pre_embed(o) {
      const type = get_type(fn)
      ser = Serializer.get(type)

      act._deserializer = des_embed
      return des_embed(o) as any
    }
  )
  return act
}
