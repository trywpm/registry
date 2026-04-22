import type { FC, PropsWithChildren, RefObject, Child } from 'hono/jsx';

import { cloneElement, isValidElement, forwardRef, Fragment } from 'hono/jsx';

type FCReturn = ReturnType<FC<unknown>>;
type RenderReturn = ReturnType<Parameters<typeof forwardRef<unknown, AnyProps>>[0]>;

export type Ref<T> = RefObject<T> | ((instance: T | null) => void) | null | undefined;

export type AnyProps = Record<string, unknown>;
export type SlotProps = PropsWithChildren<AnyProps>;

type HonoElement = {
  ref?: Ref<unknown>;
  type: string | FC<unknown> | typeof Fragment;
  props: AnyProps & { children?: Child | Child[] };
};

function isHonoElement(child: unknown): child is HonoElement {
  return isValidElement(child) && typeof child === 'object' && child != null && 'props' in child;
}

function composeRefs(...refs: Ref<unknown>[]) {
  return (node: unknown) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref != null && typeof ref === 'object' && 'current' in ref) {
        (ref as { current: unknown }).current = node;
      }
    });
  };
}

export const Slot = forwardRef<unknown, SlotProps>((props, forwardedRef) => {
  const { children, ...slotProps } = props;

  const childrenArray = Array.isArray(children) ? children.flat() : [children];
  const slottable = childrenArray.find(isSlottable) as HonoElement | undefined;

  if (slottable) {
    const newElement = slottable.props.children;

    const newChildren: Child[] = childrenArray.map((child) => {
      if (child === slottable) {
        const newElementChildArray = Array.isArray(newElement) ? newElement.flat() : [newElement];
        if (newElementChildArray.length > 1) {
          return (<></>) as unknown as Child;
        }

        return isHonoElement(newElement)
          ? (newElement.props.children as Child)
          : ((<></>) as unknown as Child);
      }
      return child;
    });

    return (
      <SlotClone {...slotProps} ref={forwardedRef}>
        {isHonoElement(newElement)
          ? (cloneElement(
              newElement as Parameters<typeof cloneElement>[0],
              {},
              ...newChildren.flat(),
            ) as unknown as Child)
          : ((<></>) as unknown as Child)}
      </SlotClone>
    ) as unknown as RenderReturn;
  }

  return (
    <SlotClone {...slotProps} ref={forwardedRef}>
      {children}
    </SlotClone>
  ) as unknown as RenderReturn;
});

Object.assign(Slot, { displayName: 'Slot' });

type SlotCloneProps = {
  children?: Child;
};

const SlotClone = forwardRef<unknown, SlotCloneProps & AnyProps>((props, forwardedRef) => {
  const { children, ...slotProps } = props;

  if (isHonoElement(children)) {
    const childrenRef = children.ref || (children.props.ref as Ref<unknown>);
    const mergedProps = mergeProps(slotProps, children.props);

    if (children.type !== Fragment) {
      mergedProps.ref = forwardedRef ? composeRefs(forwardedRef, childrenRef) : childrenRef;
    }

    const cloned = cloneElement(children as Parameters<typeof cloneElement>[0], mergedProps);

    return cloned as unknown as RenderReturn;
  }

  const childArray = Array.isArray(children) ? children.flat() : [children];
  return (childArray.length > 1 ? <></> : <></>) as unknown as RenderReturn;
});

Object.assign(SlotClone, { displayName: 'SlotClone' });

const SLOTTABLE_IDENTIFIER = Symbol.for('hono.slottable');

type SlottableComponent = {
  __honoId: symbol;
} & FC;

export const Slottable = (({ children }) => {
  return (<>{children}</>) as unknown as FCReturn;
}) as SlottableComponent;

Object.assign(Slottable, { displayName: 'Slottable', __honoId: SLOTTABLE_IDENTIFIER });

function isSlottable(child: unknown): child is HonoElement {
  return (
    isHonoElement(child) &&
    typeof child.type === 'function' &&
    '__honoId' in child.type &&
    (child.type as SlottableComponent).__honoId === SLOTTABLE_IDENTIFIER
  );
}

function mergeProps(slotProps: AnyProps, childProps: AnyProps) {
  const overrideProps = { ...childProps };

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];

    const isHandler = /^on[A-Z]/.test(propName);
    if (isHandler) {
      if (typeof slotPropValue === 'function' && typeof childPropValue === 'function') {
        overrideProps[propName] = (...args: unknown[]) => {
          const result = childPropValue(...args);
          slotPropValue(...args);
          return result;
        };
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
    } else if (propName === 'style') {
      if (
        typeof slotPropValue === 'object' &&
        slotPropValue != null &&
        typeof childPropValue === 'object' &&
        childPropValue != null
      ) {
        overrideProps[propName] = { ...slotPropValue, ...childPropValue };
      } else if (typeof slotPropValue === 'string' && typeof childPropValue === 'string') {
        overrideProps[propName] =
          `${slotPropValue.trim().replace(/;$/, '')}; ${childPropValue.trim()}`;
      }
    } else if (propName === 'className' || propName === 'class') {
      delete overrideProps[propName];
    }
  }

  const slotClass = [slotProps.class, slotProps.className].filter(Boolean).join(' ');
  const childClass = [childProps.class, childProps.className].filter(Boolean).join(' ');

  const combinedClass = [slotClass, childClass].filter(Boolean).join(' ').trim();

  const merged = { ...slotProps, ...overrideProps };

  delete merged.class;
  delete merged.className;

  if (combinedClass) {
    merged.class = combinedClass;
    merged.className = combinedClass;
  }

  return merged;
}

export { Slot as Root };
