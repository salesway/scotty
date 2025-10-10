import * as s from "../src/scotty2"

class Embedded {
  p_complex = new Map<string, {a: number}>()
}

class Parent {
  p_redefined?: string = "in parent"
  p_embedded = new Embedded()
  p_forward?: Forward
  p_undefined?: boolean
  p_null_is_undefined?: boolean | null = null
  p_null: boolean | null = null

  p_forward_arr?: Forward[]
  p_str_array = ["a"]
}

class Forward {
  f_str!: string
}

class Child extends Parent {
  p_redefined?: string = "redefined"
  p_str = ""
}

const serEmbedded = s.of(Embedded, {
  p_complex: s.map(
    s.str,
    s.obj({a: s.num}),
  ),// s.str.array,
})


const serParent = s.of(Parent, {
  p_redefined: s.str.orundefined,
  p_embedded: serEmbedded,
  p_forward: s.forward(() => serForward).orundefined,
  p_forward_arr: s.forward(() => serForward).array.orundefined,
  p_undefined: s.bool.orundefined,
  p_null_is_undefined: s.bool.ornull.orundefined,
  // p_null: s.bool,
  // p_forward_arr: s.forward(() => serForward).array,
  // p_str_array: s.str.array,
})

const serForward = s.of(Forward, {
  f_str: s.str,
})

const serChild = serParent.extend(Child, {
  p_redefined: s.str.orundefined,
  p_str: s.str,
})
