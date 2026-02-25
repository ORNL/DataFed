[x3-linkedlist](../README.md) › [LinkedList](linkedlist.md)

# Class: LinkedList <**T**>

Implements a linked list structure

## Type parameters

▪ **T**

Type of values within this LinkedList

## Hierarchy

* **LinkedList**

## Index

### Constructors

* [constructor](linkedlist.md#constructor)

### Properties

* [first](linkedlist.md#first)
* [last](linkedlist.md#last)
* [length](linkedlist.md#length)

### Methods

* [[Symbol.iterator]](linkedlist.md#[symbol.iterator])
* [clear](linkedlist.md#clear)
* [concat](linkedlist.md#concat)
* [entries](linkedlist.md#entries)
* [every](linkedlist.md#every)
* [filter](linkedlist.md#filter)
* [find](linkedlist.md#find)
* [findItem](linkedlist.md#finditem)
* [forEach](linkedlist.md#foreach)
* [getItemByIndex](linkedlist.md#private-getitembyindex)
* [includes](linkedlist.md#includes)
* [itemOf](linkedlist.md#itemof)
* [join](linkedlist.md#join)
* [keys](linkedlist.md#keys)
* [lastItemOf](linkedlist.md#lastitemof)
* [map](linkedlist.md#map)
* [pop](linkedlist.md#pop)
* [push](linkedlist.md#push)
* [reduce](linkedlist.md#reduce)
* [reduceRight](linkedlist.md#reduceright)
* [remove](linkedlist.md#remove)
* [removeAllOccurrences](linkedlist.md#removealloccurrences)
* [shift](linkedlist.md#shift)
* [some](linkedlist.md#some)
* [unlinkCleanup](linkedlist.md#private-unlinkcleanup)
* [unshift](linkedlist.md#unshift)
* [values](linkedlist.md#values)

## Constructors

###  constructor

\+ **new LinkedList**(`values?`: Iterable‹T› | [LinkedList](linkedlist.md)‹T›): *[LinkedList](linkedlist.md)*

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`values?` | Iterable‹T› &#124; [LinkedList](linkedlist.md)‹T› | Values to be added upfront into list  |

**Returns:** *[LinkedList](linkedlist.md)*

## Properties

###  first

• **first**: *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

First item in list

___

###  last

• **last**: *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Last item in list

___

###  length

• **length**: *number* = 0

Current length of this LinkedList.
Note that this does not work anymore if you for some reason add your own LinkedListItems to LinkedList by hand

## Methods

###  [Symbol.iterator]

▸ **[Symbol.iterator]**(): *IterableIterator‹[[LinkedListItem](linkedlistitem.md)‹T›, T]›*

Returns LinkedListItem and value for every entry of this LinkedList

**Returns:** *IterableIterator‹[[LinkedListItem](linkedlistitem.md)‹T›, T]›*

___

###  clear

▸ **clear**(`unchain`: boolean): *void*

Clears this LinkedList.
The default complexity is O(1), because it only removes links to the first and last item and resets the length.
Note that if any LinkedListItem is still referenced outside the LinkedList, their before and behind fields might
still reference the chain, not freeing space.
You can set the unchain parameter to true, so every item in the linked list will be unchained,
meaning all references to before and behind items will be removed.
This increases complexity to O(n), but removes accidental outside references to the full chain.

**Parameters:**

Name | Type | Default | Description |
------ | ------ | ------ | ------ |
`unchain` | boolean | false | If `true`, remove link info from every item. Changes complexity to O(n)!  |

**Returns:** *void*

___

###  concat

▸ **concat**<**V**>(...`others`: Array‹V | [LinkedList](linkedlist.md)‹V››): *[LinkedList](linkedlist.md)‹V | T›*

Concats given values and returns a new LinkedList with all given values.
If LinkedList's are given, they will be spread.

**`see`** Array#concat

**Type parameters:**

▪ **V**

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`...others` | Array‹V &#124; [LinkedList](linkedlist.md)‹V›› | Other values or lists to be concat'ed together |

**Returns:** *[LinkedList](linkedlist.md)‹V | T›*

___

###  entries

▸ **entries**(): *IterableIterator‹[[LinkedListItem](linkedlistitem.md)‹T›, T]›*

Returns LinkedListItem and value for every entry of this LinkedList

**`see`** LinkedList#Symbol.iterator

**Returns:** *IterableIterator‹[[LinkedListItem](linkedlistitem.md)‹T›, T]›*

___

###  every

▸ **every**<**C**>(`callback`: function, `thisArg?`: C): *boolean*

As Array#every() given callback is called for every element until one call returns falsy or all elements had been processed

**`see`** Array#every

**Type parameters:**

▪ **C**

**Parameters:**

▪ **callback**: *function*

▸ (`value`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *boolean*

**Parameters:**

Name | Type |
------ | ------ |
`value` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

**Returns:** *boolean*

`false` if there was a falsy response from the callback, `true` if all elements have been processed "falselesly"

___

###  filter

▸ **filter**<**C**>(`callback`: function, `thisArg?`: C): *[LinkedList](linkedlist.md)‹T›*

Filters values into a new LinkedList

**`see`** Array#filter

**Type parameters:**

▪ **C**

**Parameters:**

▪ **callback**: *function*

decides wether given element should be part of new LinkedList

▸ (`value`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *boolean*

**Parameters:**

Name | Type |
------ | ------ |
`value` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

**Returns:** *[LinkedList](linkedlist.md)‹T›*

___

###  find

▸ **find**<**C**>(`callback`: function, `thisArg?`: C): *T | undefined*

Returns value for which given callback returns truthy

**`see`** Array#find

**Type parameters:**

▪ **C**

**Parameters:**

▪ **callback**: *function*

runs for every value in LinkedList. If it returns truthy, current value is returned.

▸ (`value`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *boolean*

**Parameters:**

Name | Type |
------ | ------ |
`value` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

**Returns:** *T | undefined*

___

###  findItem

▸ **findItem**<**C**>(`callback`: function, `thisArg?`: C): *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Returns the LinkedListItem for which given callback returns truthy

**`see`** Array#findIndex

**Type parameters:**

▪ **C**

**Parameters:**

▪ **callback**: *function*

runs for every LinkedListItem in LinkedList. If it returns truthy, current LinkedListItem is returned.

▸ (`value`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *boolean*

**Parameters:**

Name | Type |
------ | ------ |
`value` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

**Returns:** *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

___

###  forEach

▸ **forEach**<**C**>(`callback`: function, `thisArg?`: C): *void*

Iterates this LinkedList's items and values

**`see`** Array#forEach

**Type parameters:**

▪ **C**

**Parameters:**

▪ **callback**: *function*

Gets every value in LinkedList once with corresponding LinkedListItem and LinkedList

▸ (`value`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *void*

**Parameters:**

Name | Type |
------ | ------ |
`value` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

If given, callback will be bound here

**Returns:** *void*

___

### `Private` getItemByIndex

▸ **getItemByIndex**(`index`: number): *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Returns the item by given index.
Supports negative values and will return the item at `LinkedList.size - 1 + index` in that case.

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`index` | number | Index of item to get from list  |

**Returns:** *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

___

###  includes

▸ **includes**(`value`: T, `fromIndex`: number): *boolean*

Checks if value can be found within LinkedList, starting from fromIndex, if given.

**`see`** Array#includes

**Parameters:**

Name | Type | Default | Description |
------ | ------ | ------ | ------ |
`value` | T | - | value to be found in this |
`fromIndex` | number | 0 | Starting index. Supports negative values for which `this.size - 1 + fromIndex` will be used as starting point. |

**Returns:** *boolean*

true if value could be found in LinkedList (respecting fromIndex), false otherwhise

___

###  itemOf

▸ **itemOf**(`searchedValue`: T, `fromIndex`: number): *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Searches forward for given value and returns the first corresponding LinkedListItem found

**`see`** Array#indexOf

**Parameters:**

Name | Type | Default | Description |
------ | ------ | ------ | ------ |
`searchedValue` | T | - | Value to be found |
`fromIndex` | number | 0 | Index to start from |

**Returns:** *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

___

###  join

▸ **join**(`separator?`: undefined | string): *string*

Joins values within this by given separator. Uses Array#join directly.

**`see`** Array#join

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`separator?` | undefined &#124; string | separator to be used |

**Returns:** *string*

___

###  keys

▸ **keys**(): *IterableIterator‹[LinkedListItem](linkedlistitem.md)‹T››*

Iterates the LinkedListItem's of this LinkedList

**Returns:** *IterableIterator‹[LinkedListItem](linkedlistitem.md)‹T››*

___

###  lastItemOf

▸ **lastItemOf**(`searchedValue`: T, `fromIndex`: number): *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Searches backwards for given value and returns the first corresponding LinkedListItem found

**`see`** Array#indexOf

**Parameters:**

Name | Type | Default | Description |
------ | ------ | ------ | ------ |
`searchedValue` | T | - | Value to be found |
`fromIndex` | number | -1 | Index to start from |

**Returns:** *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

___

###  map

▸ **map**<**V**, **C**>(`callback`: function, `thisArg?`: C): *[LinkedList](linkedlist.md)‹V›*

Creates a new LinkedList with each of its itesm representing the output of the callback with each item in current LinkedList.

**`see`** Array#map

**Type parameters:**

▪ **V**

▪ **C**

**Parameters:**

▪ **callback**: *function*

Gets value, LinkedListeItem and LinkedList. The response will be used as value in the new LinkedList

▸ (`value`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *V*

**Parameters:**

Name | Type |
------ | ------ |
`value` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

If given, callback is bound to thisArg

**Returns:** *[LinkedList](linkedlist.md)‹V›*

___

###  pop

▸ **pop**(): *T | undefined*

Removes the last LinkedListItem and returns its inner value

**Returns:** *T | undefined*

___

###  push

▸ **push**(...`values`: T[]): *number*

Adds given values on the end of this LinkedList

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`...values` | T[] | Values to be added  |

**Returns:** *number*

___

###  reduce

▸ **reduce**<**V**>(`callback`: function): *V*

From Array#reduce on MDN: The reduce() method executes a reducer function (that you provide) on each element of the LinkedList,
resulting in a single output value.

**`see`** Array#reduce

**Type parameters:**

▪ **V**

**Parameters:**

▪ **callback**: *function*

Gets accumulator, value, LinkedListeItem and LinkedList. The response will be used as the next accumulator

▸ (`accumulator`: T, `currentValue`: T, `currentItem`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *V*

**Parameters:**

Name | Type |
------ | ------ |
`accumulator` | T |
`currentValue` | T |
`currentItem` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

**Returns:** *V*

▸ **reduce**<**V**>(`callback`: function, `initialValue`: V): *V*

**Type parameters:**

▪ **V**

**Parameters:**

▪ **callback**: *function*

▸ (`accumulator`: V, `currentValue`: T, `currentItem`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *V*

**Parameters:**

Name | Type |
------ | ------ |
`accumulator` | V |
`currentValue` | T |
`currentItem` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪ **initialValue**: *V*

**Returns:** *V*

___

###  reduceRight

▸ **reduceRight**<**V**>(`callback`: function): *V*

From Array#reduce on MDN: The reduceRight() method applies a function against an accumulator and each value of the LinkedList (from last-to-first)
to reduce it to a single value.

**Type parameters:**

▪ **V**

**Parameters:**

▪ **callback**: *function*

Gets accumulator, value, LinkedListeItem and LinkedList. The response will be used as the next accumulator

▸ (`accumulator`: T, `currentValue`: T, `currentItem`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *V*

**Parameters:**

Name | Type |
------ | ------ |
`accumulator` | T |
`currentValue` | T |
`currentItem` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

**Returns:** *V*

▸ **reduceRight**<**V**>(`callback`: function, `initialValue`: V): *V*

**Type parameters:**

▪ **V**

**Parameters:**

▪ **callback**: *function*

▸ (`accumulator`: V, `currentValue`: T, `currentItem`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *V*

**Parameters:**

Name | Type |
------ | ------ |
`accumulator` | V |
`currentValue` | T |
`currentItem` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪ **initialValue**: *V*

**Returns:** *V*

___

###  remove

▸ **remove**(`value`: T): *boolean*

Removes first occurrence of value found.

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`value` | T | value to remove from LinkedList  |

**Returns:** *boolean*

___

###  removeAllOccurrences

▸ **removeAllOccurrences**(`value`: T): *boolean*

Removes every occurrance of value within this.

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`value` | T | value to remove from LinkedList  |

**Returns:** *boolean*

___

###  shift

▸ **shift**(): *T | undefined*

Returns and removes first element from LinkedList

**Returns:** *T | undefined*

___

###  some

▸ **some**<**C**>(`callback`: function, `thisArg?`: C): *boolean*

Runs callback for every entry and returns true immediately if call of callback returns truthy.

**Type parameters:**

▪ **C**

**Parameters:**

▪ **callback**: *function*

called for every element. If response is truthy, iteration

▸ (`currentValue`: T, `item`: [LinkedListItem](linkedlistitem.md)‹T›, `list`: this): *boolean*

**Parameters:**

Name | Type |
------ | ------ |
`currentValue` | T |
`item` | [LinkedListItem](linkedlistitem.md)‹T› |
`list` | this |

▪`Optional`  **thisArg**: *C*

If set, callback is bound to this

**Returns:** *boolean*

`true` once a callback call returns truthy, `false` if none returned truthy.

___

### `Private` unlinkCleanup

▸ **unlinkCleanup**(`item`: [LinkedListItem](linkedlistitem.md)‹T›): *void*

Given to own LinkedListItem's for following jobs regarding an unlink:
- If item is first item, set the next item as first item
- If item is last item, set the previous item as last item
- Decrease length

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`item` | [LinkedListItem](linkedlistitem.md)‹T› | Item that has been unlinked  |

**Returns:** *void*

___

###  unshift

▸ **unshift**(...`values`: T[]): *number*

Adds given values to the beginning of this LinkedList

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`...values` | T[] | Values to be added  |

**Returns:** *number*

___

###  values

▸ **values**(): *IterableIterator‹T›*

Returns a value for every entry of this LinkedList

**Returns:** *IterableIterator‹T›*
