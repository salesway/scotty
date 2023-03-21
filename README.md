# BEAM ME UP, SCOTTY

Add it to your project :

```sh
npm install @salesway/scotty
```

scotty is a typescript library for serializing / deserializing between JSON data and your Javascript class instances.

It uses decorators in a composable way, to keep things readable.

```typescript
import { str, num, map_of, on_deserialized } from "@salesway/scotty"

@on_deserialized((inst) => console.log("instance: ", inst))
class MyClass {
  @num number_prop = 0
  @str string_prop = "hello !"

  @map_of(str, alias(() => SubClass)).to_object
  subprop: Map<string, SubClass>
}

class SubClass {
  @num value = 44
}

const instance = deserialize({number_prop: 230, string_prop: "yes !", { key: { value: 2 } }}, MyClass)
const m = new MyClass()
const json_value = serialize(m)
```

# Class decorators

There is only one for now :

- `on_deserialized(fn: (instance) => void)`, which takes a callback that will get called everytime an instance of this class is deserialized.

## Null and undefined handling

By default :
 - When serializing, undefined values are not transmitted to the resulting object.
 - When deserializing, undefined values in the source are not interpreted and the object is left untouched (especially if its constructor)

# Default property decorators

- `str`
- `num`
- `bool`