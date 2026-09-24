import { BrowserRouter } from 'react-router-dom';
import { AnimatedRoutes } from './components/effects/AnimatedRoutes';

export function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

export default App;
