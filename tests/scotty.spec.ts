import * as s from "../src/scotty"
import test from "ava"

class Test {
  @s.str property: string = "prop"
  @s.num numprop: number = 2
  @s.bool bool: false = false
}

class Test2 extends Test {
  @s.bool.to_field("bool2") boolprop: boolean = false
}

class Test3 extends Test2 {
  @s.date_tz dt: Date = new Date("2017-05-01")
  @s.date_ms dts: Date = new Date
  @s.date_seconds dtsec: Date = new Date
}


class Test4 extends Test3 {
  @s.bool boolprop: boolean = false
}

class Zboubi {
  @s.alias(() => Test3) test: Test3 = new Test3()
}

////////////////////////////////////////////////////

test("basic serialization", t => {
  const v = s.serialize(new Test())
  t.deepEqual(v, {property: "prop", numprop: 2, bool: false})
})

test("on_deserialize", t => {
  let base = 0
  @s.on_deserialize(() => base += 1)
  class SubTest extends Test { }

  s.deserialize({}, SubTest)
  t.is(base, 1, "callback is called")

  let sub = 0
  @s.on_deserialize(() => sub += 1)
  class SubSub extends SubTest { }

  s.deserialize({}, SubSub)
  t.is(base, 2, "callback wasn't called for parent")
  t.is(sub, 1, "callback wasn't called for child")
})


// const ser = Test3[sym_serializer]
// const des = s.deserialize([{dt: "2021-04-01"}], Test3)
// console.log(des)
// const t = new Test3()
// console.log(s.serialize(t))
// console.log(s.serialize([new Test4]))

// console.log(s.serialize(new Zboubi))
