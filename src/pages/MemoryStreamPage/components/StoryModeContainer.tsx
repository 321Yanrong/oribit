import { useState } from 'react';
import StoryCapsuleCard from './StoryCapsuleCard';
import StoryPlayer from './StoryPlayer';

interface StoryModeContainerProps {
  memories: any[];
  currentUser?: any;
  friends?: any[];
}

const StoryModeContainer = ({ memories, currentUser, friends = [] }: StoryModeContainerProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="px-4 pt-4">
        <StoryCapsuleCard
          memories={memories}
          currentUser={currentUser}
          friends={friends}
          onOpen={() => setIsOpen(true)}
        />
      </div>

      <StoryPlayer memories={memories} open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default StoryModeContainer;
