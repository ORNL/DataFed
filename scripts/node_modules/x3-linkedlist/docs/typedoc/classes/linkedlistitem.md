[x3-linkedlist](../README.md) › [LinkedListItem](linkedlistitem.md)

# Class: LinkedListItem <**T**>

Represents an Item within LinkedList.
An item holds a value and the links to other LinkedListItem's
LinkedListItem's can only be attached behind.
Theirfor, to add one before, before has to add one behind.

## Type parameters

▪ **T**

## Hierarchy

* **LinkedListItem**

## Index

### Constructors

* [constructor](linkedlistitem.md#constructor)

### Properties

* [before](linkedlistitem.md#before)
* [behind](linkedlistitem.md#behind)
* [unlinkCleanup](linkedlistitem.md#protected-optional-unlinkcleanup)
* [value](linkedlistitem.md#value)

### Methods

* [insertBefore](linkedlistitem.md#protected-insertbefore)
* [insertBehind](linkedlistitem.md#insertbehind)
* [unlink](linkedlistitem.md#unlink)

## Constructors

###  constructor

\+ **new LinkedListItem**(`value`: T, `unlinkCleanup?`: undefined | function): *[LinkedListItem](linkedlistitem.md)*

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`value` | T | Value to be held |
`unlinkCleanup?` | undefined &#124; function | Function to run on unlink() call. Usually used by LinkedList to fix first and last pointers and reduce length.  |

**Returns:** *[LinkedListItem](linkedlistitem.md)*

## Properties

###  before

• **before**: *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Item before this item
A -> ThisItem -> C
^

___

###  behind

• **behind**: *[LinkedListItem](linkedlistitem.md)‹T› | undefined*

Item behind this item
A -> ThisItem -> C
                 ^

___

### `Protected` `Optional` unlinkCleanup

• **unlinkCleanup**? : *undefined | function*

Function to run on unlink() call. Usually used by LinkedList to fix first and last pointers and reduce length.

___

###  value

• **value**: *T*

Value to be held

## Methods

### `Protected` insertBefore

▸ **insertBefore**(`before`: [LinkedListItem](linkedlistitem.md)‹T›): *void*

Item given will be inserted before this item.
unlinkCleanup will be copied if neccessary.
This function is protected, because LinkedListItem's can only be attached behind.

**`see`** insertBehind

**Parameters:**

Name | Type |
------ | ------ |
`before` | [LinkedListItem](linkedlistitem.md)‹T› |

**Returns:** *void*

___

###  insertBehind

▸ **insertBehind**(`item`: [LinkedListItem](linkedlistitem.md)‹T›): *void*

This will link given LinkListItem behind this item.
If there's already a LinkedListItem linked behind, it will be relinked accordingly

**Parameters:**

Name | Type | Description |
------ | ------ | ------ |
`item` | [LinkedListItem](linkedlistitem.md)‹T› | LinkListItem to be inserted behind this one  |

**Returns:** *void*

___

###  unlink

▸ **unlink**(`unchain`: boolean): *void*

Unlinks this LinkedListItem and calls unlinkCleanup

**`see`** LinkedListItem#unlinkCleanup

**Parameters:**

Name | Type | Default | Description |
------ | ------ | ------ | ------ |
`unchain` | boolean | false | If true, additionally removes the reference to the item before and behind |

**Returns:** *void*
