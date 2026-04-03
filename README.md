<img width="1665" height="852" alt="image" src="https://github.com/user-attachments/assets/c9a839de-de02-43e1-b97a-c51a9e08521d" />


# LogicMonitor Dynamic Group Generator UI

A modern web application for creating and managing dynamic groups in LogicMonitor, featuring an intuitive 3D tree visualization and comprehensive group configuration tools.

## Features

- **3D Tree Visualization**: Interactive 3D representation of group hierarchies using Three.js and React Three Fiber
- **Dynamic Group Creation**: Build complex group structures with property-based rules
- **CSV Import/Export**: Bulk import devices and export group configurations
- **Schema Builder**: Define custom property schemas for groups
- **Consolidation Tools**: Merge and consolidate group definitions
- **API Integration**: Direct integration with LogicMonitor REST API
- **Real-time Diff**: Compare group configurations and changes
- **Property Normalization**: Standardize device properties across groups

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript
- **3D Graphics**: Three.js, @react-three/fiber, @react-three/drei
- **Styling**: Tailwind CSS (via globals.css)
- **Testing**: Vitest
- **Linting**: ESLint with Next.js config

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/cameroncompton-wq/dynamic-group_creator.git
   cd dynamic-group_creator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables (create `.env.local`):
   ```env
   LM_API_KEY=your_api_key
   LM_API_SECRET=your_api_secret
   LM_ACCOUNT=your_account_name
   ```

4. Run the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Web Interface
- **Data Source Tab**: Import devices via CSV or connect to LogicMonitor API
- **Schema Builder**: Define property schemas for your groups
- **Consolidation Tab**: Merge multiple group definitions
- **Tree Preview**: Visualize group hierarchies in 3D
- **Diff Tables**: Compare different group configurations

### API Endpoints

The application provides REST API endpoints for LogicMonitor integration:

- `POST /api/lm/devices` - Retrieve device information
- `POST /api/lm/groups` - Get existing groups
- `POST /api/lm/create-groups` - Create new dynamic groups
- `POST /api/lm/update-appliesto` - Update group applicability
- `POST /api/lm/normalize-properties` - Normalize device properties
- `POST /api/lm/test` - Test group configurations

### Building for Production

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/
│   ├── api/lm/          # LogicMonitor API routes
│   ├── globals.css      # Global styles
│   ├── layout.tsx       # Root layout
│   └── page.tsx         # Main page
├── components/          # React components
│   ├── tree3d/          # 3D tree visualization
│   └── ...              # UI components
├── lib/                 # Utility functions
│   ├── lmApi.ts         # LogicMonitor API client
│   ├── lmAuth.ts        # Authentication
│   └── types.ts         # TypeScript types
└── store/               # State management
    └── appStore.tsx     # Zustand store
```

## Development

### Running Tests
```bash
npm run test
```

### Linting
```bash
npm run lint
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

## License

This project is private and proprietary.

## Support

For questions or issues, please open an issue on GitHub or contact the development team.</content>
<parameter name="filePath">/Users/cameron.compton/dynamic-group_creator/README.md
