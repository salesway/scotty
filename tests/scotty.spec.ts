import * as s from "../src/scotty"
import test from "ava"

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

  @s.str.array p_str_array = ["a"]
}

class Forward {

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

  //<<<
  t.assert("in parent" === parent_d.p_redefined,
    "deserialization should not override constructed properties when they are unspecified")
  t.assert(parent_d.p_embedded instanceof Embedded,
    "deserialization should not override constructed properties when they are unspecified (2)")
    //>>>

  const child_d = s.deserialize({p_redefined: "ignored"}, Child)
  if (env.DEBUG) t.log(child_d)

  //<<<
  t.is("redefined", child_d.p_redefined as string,
    "WO should not deserialize anything, especially if overriden")

  //>>>
})


test("error cases", t => {
  t.pass()
})


test("on_deserialize", t => {
  let base = 0
  let sub = 0

  class Test { }

  @s.on_deserialize(() => base += 1)
  class SubTest extends Test { }

  s.deserialize({}, SubTest)
  t.is(base, 1, "callback is called")

  @s.on_deserialize(() => sub += 1)
  class SubSub extends SubTest { }

  s.deserialize({}, SubSub)
  t.is(base, 2, "callback wasn't called for parent")
  t.is(sub, 1, "callback wasn't called for child")
})
