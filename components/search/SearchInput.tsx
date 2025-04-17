'use client'; // This needs to be a Client Component for state and event handlers

import { useState, FormEvent } from 'react';
import { Input } from '@/components/ui/input'; // Assuming shadcn setup
import { Button } from '@/components/ui/button'; // Assuming shadcn setup
import { Search } from 'lucide-react'; // Optional: Icon for the button

interface SearchInputProps {
  onSearch: (query: string) => void; // Function to call when search is triggered
  isLoading?: boolean; // Optional: Disable input/button during loading
}

export function SearchInput({ onSearch, isLoading = false }: SearchInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); // Prevent default form submission page reload
    const trimmedQuery = query.trim();
    if (trimmedQuery) {
      onSearch(trimmedQuery);
    }
    // Optional: Clear input after search
    // setQuery('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm items-center space-x-2">
      <Input
        type="text"
        placeholder="Search movies or TV shows..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={isLoading}
        aria-label="Search movies or TV shows"
        name="query" 
      />
      <Button type="submit" disabled={isLoading || !query.trim()}>
        {isLoading ? (
          'Searching...' // You could use a Spinner icon here too
        ) : (
          <>
             <Search className="mr-2 h-4 w-4" /> Search {/* Optional Icon */}
             {/* Search */} {/* Without Icon */}
          </>
        )}
      </Button>
    </form>
  );
}