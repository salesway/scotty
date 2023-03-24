import * as s from "../src/scotty"
import test, { AssertionError, Assertions } from "ava"

declare var process: any // in node
const env = process.env

class Embedded {
  @s.as_is p_complex = new Map<string, {a: number}>()
}

class Parent {
  @s.str p_redefined?: string = "in parent"
  @s.embed(Embedded) p_embedded = new Embedded()
  @s.embed(() => Forward) p_forward?: Forward
  @s.bool p_undefined?: boolean
  @s.bool.null_is_undefined p_null_is_undefined?: boolean | null = null
  @s.bool p_null: boolean | null = null

  @s.embed(() => Forward).array p_forward_arr?: Forward[]
  @s.str.array p_str_array = ["a"]
}

class Forward {
  @s.str f_str!: string
}

class Child extends Parent {
  @s.str.WO p_redefined?: string = "redefined"
  p_str = ""
}

////////////////////////////////////////////////////

test("basic serialization", t => {

  const parent_s = s.serialize(new Parent()) as any
  if (env.DEBUG) t.log(parent_s)

  //<<<
  t.log("testing undefined and null handling")
  t.is(false, parent_s.hasOwnProperty("p_undefined"), "an undefined property was incorrectly serialized")
  t.is(false, parent_s.hasOwnProperty("p_null_is_undefined"), "null_is_undefined wasn't treated as undefined")
  t.is(null, parent_s.p_null, "a null value was not serialized")
  //>>>

})

test("deserialization", t => {
  // Checking first with default deserialization
  const parent_d = s.deserialize({}, Parent)

  t.log("basic deserialization")
  //<<<
  t.assert("in parent" === parent_d.p_redefined,
    "deserialization should not override constructed properties when they are unspecified")
  t.assert(parent_d.p_embedded instanceof Embedded,
    "deserialization should not override constructed properties when they are unspecified (2)")
  t.assert(parent_d instanceof Parent,
    "constructed instances should be of the correct type (parent)")
    //>>>

  const child_d = s.deserialize({p_redefined: "ignored"}, Child)
  if (env.DEBUG) t.log(child_d)

  t.log("subclass deserialization")
  //<<<
  t.is("redefined", child_d.p_redefined as string,
    "WO should not deserialize anything, especially if overriden")
  t.assert(child_d instanceof Child,
    "constructed instances should be of the correct type (child)")
  //>>>

  const child_d2 = s.deserialize({p_forward_arr: [{f_str: "field1"}, {f_str: "field2"}]}, Child)
  if (env.DEBUG) t.log(child_d2)
  //<<<
  t.assert(child_d2.p_forward_arr?.[0] instanceof Forward, "forward array should have been deserialized")
  //>>>

  const array = s.deserialize([{f_str: "forward"}], Forward)
  t.assert(Array.isArray(array), "deserializing an array must create and array")

  const forward = new Forward()
  s.deserialize({ f_str: "new value" }, forward)
  t.is(forward.f_str, "new value", "couldn't deserialize into an existing instance")
})


test("on_deserialize", t => {
  let base = 0
  let sub = 0

  class Test {
    @s.str str = ""
  }

  class SubTest extends Test {
    [s.sym_on_deserialized]() { base += 1 }
  }

  //<<<
  s.deserialize({}, SubTest)
  t.is(base, 1, "callback is called")
  //>>>

  class SubSub extends SubTest {
    [s.sym_on_deserialized]() {
      super[s.sym_on_deserialized]()
      sub += 1
    }
  }

  //<<<
  s.deserialize({}, SubSub)
  t.is(base, 2, "callback wasn't called for parent")
  t.is(sub, 1, "callback wasn't called for child")
  //>>>
})


test("error cases", t => {
  class Embedded {
    @s.str value = "hello"
  }

  class Embedder {
    @s.embed(Embedded).array arr: Embedded[] = [] // this should not be an array.
  }

  const res = s.deserialize({arr: {value: "no"}}, Embedder)
  t.assert(res.arr.length === 0, "if not given an array, a deserializer should fail when encountering one")

})

