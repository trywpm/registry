import type { PropsWithChildren, RefObject, Child } from 'hono/jsx';
import { cloneElement, forwardRef, Fragment, isValidElement } from 'hono/jsx';

export type AnyProps = Record<string, unknown>;
export type SlotProps = PropsWithChildren<AnyProps> & {
  ref?: Ref<unknown>;
};

export type Ref<T> = RefObject<T> | ((instance: T | null) => void) | null | undefined;

function isRefObject<T>(ref: unknown): ref is RefObject<T> {
  return ref != null && typeof ref === 'object' && 'current' in ref;
}

function composeRefs(...refs: Ref<unknown>[]) {
  return (node: unknown) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(node);
      } else if (isRefObject<unknown>(ref)) {
        ref.current = node;
      }
    });
  };
}

export const Slot = forwardRef<unknown, SlotProps>((props, forwardedRef) => {
  const { children, ...slotProps } = props;

  return (
    <SlotClone {...slotProps} ref={forwardedRef}>
      {children}
    </SlotClone>
  );
});

Object.assign(Slot, { displayName: 'Slot' });

type SlotCloneProps = {
  children?: Child;
};

const SlotClone = forwardRef<unknown, SlotCloneProps & AnyProps>((props, forwardedRef) => {
  const { children, ...slotProps } = props;

  if (isValidElement(children)) {
    if (children.tag === Fragment) {
      const fragProps = children.props;
      const fragChildren = fragProps.children;

      const childrenArray = Array.isArray(fragChildren)
        ? fragChildren
        : fragChildren !== undefined
          ? [fragChildren]
          : [];

      if (childrenArray.length === 1) {
        const singleValidChild = childrenArray[0];
        const childProps = singleValidChild.props;
        const childrenRef = childProps.ref;
        const mergedProps = mergeProps(slotProps, childProps);

        if (singleValidChild.tag !== Fragment) {
          mergedProps.ref = forwardedRef ? composeRefs(forwardedRef, childrenRef) : childrenRef;
        }

        return cloneElement(singleValidChild, mergedProps);
      }

      console.warn(
        'Slot component expects exactly one element child. Found multiple or zero elements inside Fragment.',
      );

      return <Fragment>{children}</Fragment>;
    }

    const childProps = children.props;
    const childrenRef = childProps.ref;
    const mergedProps = mergeProps(slotProps, childProps);

    if (children.tag !== Fragment) {
      mergedProps.ref = forwardedRef ? composeRefs(forwardedRef, childrenRef) : childrenRef;
    }

    return cloneElement(children, mergedProps);
  }

  return <Fragment>{children}</Fragment>;
});

Object.assign(SlotClone, { displayName: 'SlotClone' });

function mergeProps(slotProps: AnyProps, childProps: Record<string, unknown>): AnyProps {
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
