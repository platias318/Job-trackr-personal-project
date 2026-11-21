import { configureStore } from "@reduxjs/toolkit";
import { render, renderHook } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";

import commonReducer, {
  type CommonState,
} from "@/components/redux/common/commonSlice";

interface IOptions {
  route?: string;
  auth?: Partial<CommonState>;
}

// A real store (just the auth slice, like the app) so components and hooks run
// against genuine Redux behaviour instead of a hand-rolled fake.
export const createTestStore = (auth: Partial<CommonState> = {}) =>
  configureStore({
    reducer: { common: commonReducer },
    preloadedState: {
      common: {
        user: null,
        isUserAuthenticated: false,
        isAuthLoading: false,
        ...auth,
      },
    },
  });

const makeWrapper = ({ route = "/", auth }: IOptions) => {
  const store = createTestStore(auth);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </Provider>
  );
  return { store, Wrapper };
};

export const renderWithProviders = (ui: ReactElement, options: IOptions = {}) => {
  const { store, Wrapper } = makeWrapper(options);
  return { store, ...render(ui, { wrapper: Wrapper }) };
};

export const renderHookWithProviders = <T,>(
  hook: () => T,
  options: IOptions = {},
) => {
  const { store, Wrapper } = makeWrapper(options);
  return { store, ...renderHook(hook, { wrapper: Wrapper }) };
};
